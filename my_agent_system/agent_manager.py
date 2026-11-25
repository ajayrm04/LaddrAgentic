"""Localhost service for creating agents and rebuilding the Compose stack."""

from __future__ import annotations

import json
import keyword
import os
import re
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import yaml


PROJECT_ROOT = Path(__file__).resolve().parent
REPO_ROOT = PROJECT_ROOT.parent
LADDR_SOURCE = REPO_ROOT / "lib" / "laddr" / "src"
PORT = 8765
MAX_REQUEST_BYTES = 16 * 1024
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
ALLOWED_HOSTS = {"localhost:8765", "127.0.0.1:8765"}
AGENT_NAME_PATTERN = re.compile(r"[a-z][a-z0-9_]{0,49}\Z")
operation_lock = threading.Lock()


class ManagerError(Exception):
    def __init__(
        self,
        status_code: int,
        detail: str,
        *,
        agent_created: bool = False,
        agent_removed: bool = False,
        stack_updated: bool = False,
        retryable: bool = False,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.agent_created = agent_created
        self.agent_removed = agent_removed
        self.stack_updated = stack_updated
        self.retryable = retryable


def validate_agent_name(name: object) -> str:
    if not isinstance(name, str) or not AGENT_NAME_PATTERN.fullmatch(name):
        raise ManagerError(
            400,
            "Agent name must start with a lowercase letter and contain only "
            "lowercase letters, numbers, or underscores (up to 50 characters).",
        )
    if keyword.iskeyword(name) or name == "__init__":
        raise ManagerError(400, "That name is reserved by Python.")
    return name


def validate_agent_payload(payload: object) -> dict[str, str]:
    if not isinstance(payload, dict):
        raise ManagerError(400, "The request body must be a JSON object.")

    name = validate_agent_name(payload.get("name"))

    limits = {"role": 200, "goal": 2000, "backstory": 4000}
    values = {"name": name}
    for field, max_length in limits.items():
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ManagerError(400, f"{field.capitalize()} is required.")
        value = value.strip()
        if len(value) > max_length:
            raise ManagerError(
                400,
                f"{field.capitalize()} must be {max_length} characters or fewer.",
            )
        if any(
            ord(char) == 127
            or (ord(char) < 32 and char not in ("\n", "\r", "\t"))
            for char in value
        ):
            raise ManagerError(400, f"{field.capitalize()} contains invalid characters.")
        if field == "role" and ("\n" in value or "\r" in value):
            raise ManagerError(400, "Role must be a single line.")
        values[field] = value
    return values


def _run_command(
    command: list[str],
    *,
    cwd: Path,
    timeout: int,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as error:
        raise ManagerError(
            503,
            f"Required command was not found: {command[0]}. "
            "Check that Python and Docker Compose are installed and on PATH.",
        ) from error
    except subprocess.TimeoutExpired as error:
        raise ManagerError(
            504,
            f"Command timed out after {timeout} seconds: {' '.join(command[:3])}",
        ) from error
    except OSError as error:
        raise ManagerError(
            500,
            f"Could not run required command: {command[0]} ({error}).",
        ) from error


def _command_output(result: subprocess.CompletedProcess[str]) -> str:
    output = "\n".join(part for part in (result.stdout, result.stderr) if part).strip()
    return output[-8000:]


def _delete_agent_registry_entry(project_root: Path, agent_name: str) -> bool:
    script = (
        "import os, sys\n"
        "from sqlalchemy import create_engine, text\n"
        "database_url = os.environ.get('DATABASE_URL')\n"
        "if not database_url:\n"
        "    raise SystemExit('DATABASE_URL is not configured in the API container')\n"
        "engine = create_engine(database_url)\n"
        "with engine.begin() as connection:\n"
        "    result = connection.execute(\n"
        "        text('DELETE FROM agent_registry WHERE agent_name = :name'),\n"
        "        {'name': sys.argv[1]},\n"
        "    )\n"
        "    print(result.rowcount)\n"
    )
    result = _run_command(
        [
            "docker",
            "compose",
            "exec",
            "-T",
            "api",
            "python",
            "-c",
            script,
            agent_name,
        ],
        cwd=project_root,
        timeout=60,
    )
    if result.returncode:
        raise ManagerError(
            500,
            "Could not remove the agent's registry entry from the API database. "
            "The worker was stopped; retry the deletion after checking the API database.",
            retryable=True,
        )

    try:
        affected_rows = int(result.stdout.strip().splitlines()[-1])
    except (IndexError, ValueError) as error:
        raise ManagerError(
            500,
            "The API database did not confirm whether the agent registry entry was removed.",
            retryable=True,
        ) from error
    return affected_rows > 0


def _read_text_preserving_newlines(path: Path) -> str:
    with path.open(encoding="utf-8", newline="") as file:
        return file.read()


def _write_text_preserving_newlines(path: Path, content: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        file.write(content)


def _mapping_value(node: object, key: str) -> object | None:
    if getattr(node, "id", None) != "mapping":
        return None
    for key_node, value_node in node.value:
        if getattr(key_node, "value", None) == key:
            return value_node
    return None


def _without_yaml_sequence_values(source: str, path: tuple[str, ...], values: set[str]) -> str:
    document = yaml.compose(source)
    node = document
    for key in path[:-1]:
        node = _mapping_value(node, key)
    sequence = _mapping_value(node, path[-1])
    if getattr(sequence, "id", None) != "sequence":
        raise ManagerError(500, f"YAML field {'/'.join(path)} must be a block list.")

    lines = source.splitlines(keepends=True)
    lines_to_remove = set()
    for item in sequence.value:
        if getattr(item, "value", None) not in values:
            continue
        line_number = item.start_mark.line
        line = lines[line_number]
        content = line.lstrip(" \t")
        if not content.startswith("- "):
            raise ManagerError(
                500,
                f"YAML field {'/'.join(path)} must use one block-list item per line.",
            )
        lines_to_remove.add(line_number)
    return "".join(line for index, line in enumerate(lines) if index not in lines_to_remove)


def _without_yaml_mapping_entries(source: str, path: tuple[str, ...], keys: set[str]) -> str:
    document = yaml.compose(source)
    node = document
    for parent_key in path[:-1]:
        node = _mapping_value(node, parent_key)
    mapping = _mapping_value(node, path[-1])
    if getattr(mapping, "id", None) != "mapping":
        raise ManagerError(500, f"YAML field {'/'.join(path)} must be a mapping.")

    lines = source.splitlines(keepends=True)
    lines_to_remove = set()
    for key_node, value_node in mapping.value:
        if getattr(key_node, "value", None) not in keys:
            continue
        start_line = key_node.start_mark.line
        prefix = lines[start_line][: key_node.start_mark.column]
        if prefix.strip():
            raise ManagerError(
                500,
                f"YAML field {'/'.join(path)} must use one block-mapping entry per line.",
            )
        end_line = value_node.end_mark.line
        if end_line <= start_line:
            end_line = start_line + 1
        lines_to_remove.update(
            index
            for index in range(start_line, end_line)
            if lines[index].strip() and not lines[index].lstrip().startswith("#")
        )
    return "".join(line for index, line in enumerate(lines) if index not in lines_to_remove)


def restart_stack(project_root: Path = PROJECT_ROOT) -> str:
    result = _run_command(
        ["docker", "compose", "up", "--build", "-d", "--remove-orphans"],
        cwd=project_root,
        timeout=1200,
    )
    if result.returncode:
        detail = "Docker Compose could not update the stack."
        output = _command_output(result)
        if output:
            detail = f"{detail}\n\n{output}"
        raise ManagerError(500, detail)
    return _command_output(result)


def create_agent(payload: object, project_root: Path = PROJECT_ROOT) -> dict[str, str]:
    agent = validate_agent_payload(payload)
    agent_file = project_root / "agents" / f"{agent['name']}.py"
    if agent_file.exists():
        raise ManagerError(409, f"Agent '{agent['name']}' already exists.")

    if not (project_root / "laddr.yml").is_file() or not (
        project_root / "docker-compose.yml"
    ).is_file():
        raise ManagerError(500, "The project is missing laddr.yml or docker-compose.yml.")
    if not LADDR_SOURCE.is_dir():
        raise ManagerError(500, f"Laddr CLI source was not found at {LADDR_SOURCE}.")

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    existing_pythonpath = env.get("PYTHONPATH")
    env["PYTHONPATH"] = str(LADDR_SOURCE) + (
        os.pathsep + existing_pythonpath if existing_pythonpath else ""
    )
    cli_command = [
        sys.executable,
        "-c",
        "from laddr.cli.main import cli; cli(prog_name='laddr')",
        "add",
        "agent",
        agent["name"],
        f"--role={agent['role']}",
        f"--goal={agent['goal']}",
        f"--backstory={agent['backstory']}",
    ]
    result = _run_command(cli_command, cwd=project_root, timeout=120, env=env)
    if result.returncode:
        output = _command_output(result)
        detail = "The laddr add agent command failed."
        if output:
            detail = f"{detail}\n\n{output}"
        raise ManagerError(500, detail)

    try:
        compose_output = restart_stack(project_root)
    except ManagerError as error:
        raise ManagerError(
            error.status_code,
            f"Agent '{agent['name']}' was created, but the Docker stack update failed. "
            f"{error}",
            agent_created=True,
        ) from error
    return {
        "name": agent["name"],
        "message": f"Agent '{agent['name']}' was created and the Docker stack was updated.",
        "output": compose_output,
    }


def _remove_agent_env_settings(project_root: Path, agent_name: str) -> bool:
    env_path = project_root / ".env"
    if not env_path.is_file():
        return False

    keys_to_remove = {
        f"LLM_MODEL_{agent_name.upper()}",
        f"LLM_BACKEND_{agent_name.upper()}",
    }
    original = _read_text_preserving_newlines(env_path)
    remaining_lines = []
    for line in original.splitlines(keepends=True):
        key, separator, _ = line.lstrip("\ufeff").partition("=")
        if not separator or key.strip() not in keys_to_remove:
            remaining_lines.append(line)
    updated = "".join(remaining_lines)
    if updated == original:
        return False

    _write_text_preserving_newlines(env_path, updated)
    return True


def delete_agent(payload: object, project_root: Path = PROJECT_ROOT) -> dict[str, str]:
    if not isinstance(payload, dict):
        raise ManagerError(400, "The request body must be a JSON object.")

    agent_name = validate_agent_name(payload.get("name"))
    retry = payload.get("retry", False)
    if not isinstance(retry, bool):
        raise ManagerError(400, "The retry field must be a boolean.")
    if not (project_root / "laddr.yml").is_file() or not (
        project_root / "docker-compose.yml"
    ).is_file():
        raise ManagerError(500, "The project is missing laddr.yml or docker-compose.yml.")

    try:
        laddr_path = project_root / "laddr.yml"
        compose_path = project_root / "docker-compose.yml"
        laddr_text = _read_text_preserving_newlines(laddr_path)
        compose_text = _read_text_preserving_newlines(compose_path)
        laddr_data = yaml.safe_load(laddr_text)
        compose_data = yaml.safe_load(compose_text)
    except (OSError, yaml.YAMLError) as error:
        raise ManagerError(500, f"Could not read the project configuration: {error}") from error

    if not isinstance(laddr_data, dict) or not isinstance(laddr_data.get("project"), dict):
        raise ManagerError(500, "laddr.yml must contain a project mapping.")
    project_config = laddr_data["project"]
    configured_agents = project_config.get("agents", [])
    if not isinstance(configured_agents, list):
        raise ManagerError(500, "laddr.yml project.agents must be a list.")
    if not isinstance(compose_data, dict) or not isinstance(
        compose_data.get("services"), dict
    ):
        raise ManagerError(500, "docker-compose.yml must contain a services mapping.")

    updated_laddr_text = (
        _without_yaml_sequence_values(
            laddr_text,
            ("project", "agents"),
            {agent_name},
        )
        if "agents" in project_config
        else laddr_text
    )
    services = compose_data["services"]
    core_services = {"api", "dashboard", "postgres", "redis", "minio"}
    services_to_remove = []
    worker_service = f"{agent_name}_worker"
    if worker_service in services:
        services_to_remove.append(worker_service)
    if agent_name in services and agent_name not in core_services:
        services_to_remove.append(agent_name)
    updated_compose_text = _without_yaml_mapping_entries(
        compose_text,
        ("services",),
        set(services_to_remove),
    )

    agents_dir = project_root / "agents"
    project_root_resolved = project_root.resolve()
    if agents_dir.exists() and (
        agents_dir.is_symlink() or agents_dir.resolve().parent != project_root_resolved
    ):
        raise ManagerError(400, "The agents directory must be a direct project subdirectory.")

    agent_file = agents_dir / f"{agent_name}.py"
    agent_package = agents_dir / agent_name
    if agent_file.exists() and not agent_file.is_file():
        raise ManagerError(400, "The agent source path must be a file.")
    if agent_package.exists() and not agent_package.is_dir():
        raise ManagerError(400, "The agent package path must be a directory.")
    has_agent_source = agent_file.exists() or agent_file.is_symlink()
    has_agent_package = agent_package.exists() or agent_package.is_symlink()
    has_project_references = (
        agent_name in configured_agents
        or bool(services_to_remove)
        or has_agent_source
        or has_agent_package
    )

    for service_name in services_to_remove:
        result = _run_command(
            ["docker", "compose", "stop", service_name],
            cwd=project_root,
            timeout=90,
        )
        if result.returncode:
            raise ManagerError(
                500,
                f"Could not stop worker service '{service_name}'. "
                "No project files were changed; retry the deletion.",
                retryable=True,
            )

    try:
        registry_removed = _delete_agent_registry_entry(project_root, agent_name)
    except ManagerError as error:
        raise ManagerError(
            error.status_code,
            str(error),
            retryable=True,
        ) from error

    if not has_project_references and not registry_removed and not retry:
        raise ManagerError(404, f"Agent '{agent_name}' is not configured in this project.")

    project_changed = False
    try:
        if updated_laddr_text != laddr_text:
            project_changed = True
            _write_text_preserving_newlines(laddr_path, updated_laddr_text)

        if updated_compose_text != compose_text:
            project_changed = True
            _write_text_preserving_newlines(compose_path, updated_compose_text)

        if has_agent_source:
            project_changed = True
            agent_file.unlink()

        if has_agent_package:
            project_changed = True
            if agent_package.is_symlink():
                agent_package.unlink()
            else:
                resolved_package = agent_package.resolve()
                if resolved_package.parent != agents_dir.resolve():
                    raise ManagerError(
                        400,
                        "The agent package must be a direct child of the agents directory.",
                        agent_removed=project_changed or registry_removed,
                        retryable=True,
                    )
                shutil.rmtree(resolved_package)

        if _remove_agent_env_settings(project_root, agent_name):
            project_changed = True
    except ManagerError:
        raise
    except (OSError, yaml.YAMLError) as error:
        raise ManagerError(
            500,
            f"Agent registry cleanup completed, but project files could not be fully updated: {error}",
            agent_removed=project_changed or registry_removed,
            retryable=True,
        ) from error

    try:
        compose_output = restart_stack(project_root)
    except ManagerError as error:
        raise ManagerError(
            error.status_code,
            f"Agent '{agent_name}' was removed from project files, but Docker Compose "
            f"could not finish the stack update. {error}",
            agent_removed=project_changed or registry_removed,
            retryable=True,
        ) from error

    return {
        "name": agent_name,
        "message": (
            f"Agent '{agent_name}' was removed and the Docker stack was updated. "
            "Its existing history is retained."
        ),
        "output": compose_output,
    }


class AgentManagerHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def _host_is_local(self) -> bool:
        return self.headers.get("Host", "").lower() in ALLOWED_HOSTS

    def _origin_is_allowed(self) -> bool:
        return self.headers.get("Origin") in ALLOWED_ORIGINS

    def do_OPTIONS(self) -> None:
        if not self._host_is_local() or not self._origin_is_allowed():
            self._send_json(403, {"detail": "Request origin is not allowed."})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Vary", "Origin")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        if not self._host_is_local():
            self._send_json(403, {"detail": "Requests must use localhost."})
            return
        if urlsplit(self.path).path != "/health":
            self._send_json(404, {"detail": "Not found."})
            return
        self._send_json(200, {"ok": True})

    def do_POST(self) -> None:
        if not self._host_is_local() or not self._origin_is_allowed():
            self._send_json(403, {"detail": "Request origin is not allowed."})
            return

        path = urlsplit(self.path).path
        if path not in {"/agents", "/agents/delete", "/stack/restart"}:
            self._send_json(404, {"detail": "Not found."})
            return
        if not operation_lock.acquire(blocking=False):
            self._send_json(409, {"detail": "Another agent or stack operation is in progress."})
            return

        try:
            if path == "/stack/restart":
                output = restart_stack()
                self._send_json(
                    200,
                    {"message": "Docker Compose stack updated.", "output": output},
                )
                return

            if self.headers.get_content_type() != "application/json":
                self._send_json(415, {"detail": "Content-Type must be application/json."})
                return
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self._send_json(400, {"detail": "Invalid Content-Length."})
                return
            if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
                self._send_json(413, {"detail": "Request body is empty or too large."})
                return
            try:
                payload = json.loads(self.rfile.read(content_length))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self._send_json(400, {"detail": "Request body must contain valid JSON."})
                return

            if path == "/agents/delete":
                result = delete_agent(payload)
            else:
                result = create_agent(payload)
            self._send_json(200, result)
        except ManagerError as error:
            self._send_json(
                error.status_code,
                {
                    "detail": str(error),
                    "agent_created": error.agent_created,
                    "agent_removed": error.agent_removed,
                    "stack_updated": error.stack_updated,
                    "retryable": error.retryable,
                },
            )
        finally:
            operation_lock.release()

    def log_message(self, format: str, *args: object) -> None:
        print(f"[Agent Manager] {self.address_string()} - {format % args}")


def main() -> None:
    required_files = ("laddr.yml", "docker-compose.yml", "Dockerfile")
    missing = [name for name in required_files if not (PROJECT_ROOT / name).is_file()]
    if missing:
        raise SystemExit(f"Run this helper from a Laddr project; missing: {', '.join(missing)}")
    if not LADDR_SOURCE.is_dir():
        raise SystemExit(f"Laddr source was not found at {LADDR_SOURCE}")

    server = ThreadingHTTPServer(("127.0.0.1", PORT), AgentManagerHandler)
    print(f"Laddr Agent Manager listening at http://127.0.0.1:{PORT}")
    print(f"Project: {PROJECT_ROOT}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Laddr Agent Manager.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
