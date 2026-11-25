from http.server import ThreadingHTTPServer
import json
import os
import tempfile
import unittest
from pathlib import Path
from subprocess import CompletedProcess
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

import agent_manager
import yaml


class AgentManagerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project = Path(self.temp_dir.name)
        (self.project / "agents").mkdir()
        (self.project / "laddr.yml").write_text("project:\n  agents: []\n", encoding="utf-8")
        (self.project / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")
        self.payload = {
            "name": "research_helper",
            "role": "Research Specialist",
            "goal": "Find reliable information.",
            "backstory": "Experienced researcher.",
        }

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_rejects_names_that_could_escape_the_agents_package(self):
        payload = {**self.payload, "name": "../worker"}

        with self.assertRaises(agent_manager.ManagerError) as raised:
            agent_manager.validate_agent_payload(payload)

        self.assertEqual(raised.exception.status_code, 400)

    def test_create_runs_cli_then_compose_with_fixed_argument_lists(self):
        completed = CompletedProcess([], 0, "ok", "")
        with patch.object(
            agent_manager,
            "_run_command",
            side_effect=[completed, completed],
        ) as run_command:
            result = agent_manager.create_agent(self.payload, self.project)

        cli_command = run_command.call_args_list[0].args[0]
        compose_command = run_command.call_args_list[1].args[0]
        self.assertEqual(
            cli_command[1:4],
            [
                "-c",
                "from laddr.cli.main import cli; cli(prog_name='laddr')",
                "add",
            ],
        )
        self.assertEqual(cli_command[4], "agent")
        self.assertEqual(
            run_command.call_args_list[0].kwargs["env"]["PYTHONIOENCODING"],
            "utf-8",
        )
        self.assertTrue(any(argument.startswith("--backstory=") for argument in cli_command))
        self.assertEqual(
            compose_command,
            ["docker", "compose", "up", "--build", "-d", "--remove-orphans"],
        )
        self.assertEqual(result["name"], "research_helper")

    def test_create_runs_cli_successfully_with_utf8_windows_output(self):
        with patch.object(agent_manager, "restart_stack", return_value="stack updated"):
            result = agent_manager.create_agent(self.payload, self.project)

        self.assertEqual(result["name"], "research_helper")
        self.assertTrue((self.project / "agents" / "research_helper.py").is_file())

    def test_compose_failure_reports_that_agent_files_were_already_created(self):
        generated = CompletedProcess([], 0, "agent generated", "")
        failed_compose = CompletedProcess([], 1, "", "compose failed")
        with patch.object(
            agent_manager,
            "_run_command",
            side_effect=[generated, failed_compose],
        ):
            with self.assertRaises(agent_manager.ManagerError) as raised:
                agent_manager.create_agent(self.payload, self.project)

        self.assertTrue(raised.exception.agent_created)
        self.assertFalse(raised.exception.stack_updated)
        self.assertIn("compose failed", str(raised.exception))

    def test_existing_agent_is_not_overwritten(self):
        (self.project / "agents" / "research_helper.py").write_text(
            "# Existing agent\n",
            encoding="utf-8",
        )
        with patch.object(agent_manager, "_run_command") as run_command:
            with self.assertRaises(agent_manager.ManagerError) as raised:
                agent_manager.create_agent(self.payload, self.project)

        self.assertEqual(raised.exception.status_code, 409)
        run_command.assert_not_called()

    def test_delete_removes_only_the_selected_agent_and_preserves_history_data(self):
        (self.project / "agents" / "research_helper.py").write_text(
            "# agent source\n",
            encoding="utf-8",
        )
        laddr_text = (
            "# Keep project settings\n"
            "project:\n"
            "  agents:\n"
            "    - research_helper\n"
            "    # Keep the remaining agent entry\n"
            "    - analyst\n"
        )
        (self.project / "laddr.yml").write_text(
            laddr_text,
            encoding="utf-8",
        )
        compose_text = (
            "# Keep unrelated Compose settings\n"
            "services:\n"
            "  research_helper_worker:\n"
            "    command: python -m agents.research_helper\n"
            "  # Keep the analyst worker comment\n"
            "  analyst_worker:\n"
            "    command: python -m agents.analyst\n"
        )
        (self.project / "docker-compose.yml").write_text(
            compose_text,
            encoding="utf-8",
        )
        (self.project / ".env").write_text(
            "LLM_MODEL_RESEARCH_HELPER=gemini-test\n"
            "LLM_BACKEND_RESEARCH_HELPER=gemini\n"
            "LLM_MODEL_ANALYST=openai-test\n"
            "API_KEY=preserve-me\n",
            encoding="utf-8",
        )
        completed = CompletedProcess([], 0, "ok", "")

        with (
            patch.object(agent_manager, "_delete_agent_registry_entry", return_value=True),
            patch.object(agent_manager, "_run_command", return_value=completed) as run_command,
        ):
            result = agent_manager.delete_agent(
                {"name": "research_helper"},
                self.project,
            )

        self.assertEqual(
            run_command.call_args_list[0].args[0],
            ["docker", "compose", "stop", "research_helper_worker"],
        )
        self.assertEqual(
            run_command.call_args_list[1].args[0],
            ["docker", "compose", "up", "--build", "-d", "--remove-orphans"],
        )
        self.assertFalse((self.project / "agents" / "research_helper.py").exists())
        self.assertEqual(
            yaml.safe_load((self.project / "laddr.yml").read_text(encoding="utf-8")),
            {"project": {"agents": ["analyst"]}},
        )
        self.assertEqual(
            agent_manager._read_text_preserving_newlines(self.project / "laddr.yml"),
            laddr_text.replace("    - research_helper\n", "").replace("\n", os.linesep),
        )
        self.assertEqual(
            agent_manager._read_text_preserving_newlines(
                self.project / "docker-compose.yml"
            ),
            compose_text.replace(
                "  research_helper_worker:\n"
                "    command: python -m agents.research_helper\n",
                "",
            ).replace("\n", os.linesep),
        )
        self.assertEqual(
            list(
                yaml.safe_load(
                    (self.project / "docker-compose.yml").read_text(encoding="utf-8")
                )["services"]
            ),
            ["analyst_worker"],
        )
        env_content = (self.project / ".env").read_text(encoding="utf-8")
        self.assertNotIn("RESEARCH_HELPER", env_content)
        self.assertIn("LLM_MODEL_ANALYST=openai-test", env_content)
        self.assertIn("API_KEY=preserve-me", env_content)
        self.assertIn("history is retained", result["message"])

    def test_delete_compose_failure_reports_partial_removal_for_retry(self):
        (self.project / "agents" / "research_helper.py").write_text(
            "# agent source\n",
            encoding="utf-8",
        )
        (self.project / "laddr.yml").write_text(
            "project:\n  agents:\n    - research_helper\n",
            encoding="utf-8",
        )
        (self.project / "docker-compose.yml").write_text(
            "services:\n  research_helper_worker: {}\n",
            encoding="utf-8",
        )
        stopped = CompletedProcess([], 0, "", "")
        failed_compose = CompletedProcess([], 1, "", "compose failed")
        with (
            patch.object(agent_manager, "_delete_agent_registry_entry", return_value=True),
            patch.object(
                agent_manager,
                "_run_command",
                side_effect=[stopped, failed_compose],
            ),
        ):
            with self.assertRaises(agent_manager.ManagerError) as raised:
                agent_manager.delete_agent({"name": "research_helper"}, self.project)

        self.assertTrue(raised.exception.agent_removed)
        self.assertFalse(raised.exception.stack_updated)
        self.assertTrue(raised.exception.retryable)
        self.assertFalse((self.project / "agents" / "research_helper.py").exists())
        self.assertIn("compose failed", str(raised.exception))

    def test_delete_retry_reconciles_orphaned_service_after_partial_failure(self):
        completed = CompletedProcess([], 0, "ok", "")
        with (
            patch.object(agent_manager, "_delete_agent_registry_entry", return_value=False),
            patch.object(agent_manager, "_run_command", return_value=completed) as run_command,
        ):
            result = agent_manager.delete_agent(
                {"name": "research_helper", "retry": True},
                self.project,
            )

        run_command.assert_called_once_with(
            ["docker", "compose", "up", "--build", "-d", "--remove-orphans"],
            cwd=self.project,
            timeout=1200,
        )
        self.assertTrue(result["name"] == "research_helper")

    def test_registry_cleanup_uses_a_bound_agent_name(self):
        completed = CompletedProcess([], 0, "1\n", "")
        with patch.object(agent_manager, "_run_command", return_value=completed) as run_command:
            self.assertTrue(
                agent_manager._delete_agent_registry_entry(self.project, "research_helper")
            )

        command = run_command.call_args.args[0]
        self.assertEqual(command[-1], "research_helper")
        self.assertIn("agent_registry WHERE agent_name = :name", command[7])
        self.assertIn("sys.argv[1]", command[7])

    def test_registry_failure_leaves_project_files_unchanged_and_can_be_retried(self):
        (self.project / "agents" / "research_helper.py").write_text(
            "# agent source\n",
            encoding="utf-8",
        )
        (self.project / "docker-compose.yml").write_text(
            "services:\n  research_helper_worker: {}\n",
            encoding="utf-8",
        )
        completed = CompletedProcess([], 0, "", "")
        with (
            patch.object(
                agent_manager,
                "_delete_agent_registry_entry",
                side_effect=agent_manager.ManagerError(500, "database unavailable"),
            ),
            patch.object(agent_manager, "_run_command", return_value=completed) as run_command,
        ):
            with self.assertRaises(agent_manager.ManagerError) as raised:
                agent_manager.delete_agent({"name": "research_helper"}, self.project)

        self.assertTrue(raised.exception.retryable)
        self.assertFalse(raised.exception.agent_removed)
        self.assertTrue((self.project / "agents" / "research_helper.py").is_file())
        run_command.assert_called_once_with(
            ["docker", "compose", "stop", "research_helper_worker"],
            cwd=self.project,
            timeout=90,
        )

    def test_http_endpoint_rejects_invalid_agent_names(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), agent_manager.AgentManagerHandler)
        port = server.server_address[1]
        original_hosts = agent_manager.ALLOWED_HOSTS.copy()
        agent_manager.ALLOWED_HOSTS.add(f"127.0.0.1:{port}")
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            request = Request(
                f"http://127.0.0.1:{port}/agents/delete",
                data=json.dumps({"name": "../bad"}).encode("utf-8"),
                headers={
                    "Origin": "http://localhost:5173",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with patch.object(agent_manager, "_run_command") as run_command:
                with self.assertRaises(HTTPError) as raised:
                    urlopen(request, timeout=5)

            self.assertEqual(raised.exception.code, 400)
            self.assertEqual(
                raised.exception.headers.get("Access-Control-Allow-Origin"),
                "http://localhost:5173",
            )
            run_command.assert_not_called()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
            agent_manager.ALLOWED_HOSTS.clear()
            agent_manager.ALLOWED_HOSTS.update(original_hosts)


if __name__ == "__main__":
    unittest.main()
