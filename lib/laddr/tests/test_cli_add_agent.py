import ast
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import yaml

from laddr.cli.commands.add import _create_agent_files
from laddr.cli.utils.docker import add_worker_to_compose


class AddAgentCliTests(unittest.TestCase):
    def test_add_agent_command_succeeds_with_legacy_cp1252_console(self):
        source_root = Path(__file__).resolve().parents[1] / "src"
        env = os.environ.copy()
        env["PYTHONPATH"] = os.pathsep.join(
            [str(source_root), env.get("PYTHONPATH", "")]
        )
        env["PYTHONIOENCODING"] = "cp1252"

        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir)
            (project / "laddr.yml").write_text(
                "project:\n  agents: []\n",
                encoding="utf-8",
            )
            (project / "docker-compose.yml").write_text(
                "services: {}\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "laddr.cli.main",
                    "add",
                    "agent",
                    "cp1252_helper",
                    "--role=Test role",
                    "--goal=Verify legacy console support.",
                    "--backstory=Used to test Windows CLI output.",
                ],
                cwd=project,
                env=env,
                capture_output=True,
                text=True,
                encoding="cp1252",
                timeout=30,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((project / "agents" / "cp1252_helper.py").is_file())

    def test_agent_role_goal_and_backstory_are_written_as_python_strings(self):
        role = 'Researcher "Level 2"'
        goal = "First line\nSecond line"
        backstory = "A backstory with 'quotes' and a newline\n."
        original_directory = Path.cwd()

        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir)
            (project / "laddr.yml").write_text(
                "project:\n  agents: []\n",
                encoding="utf-8",
            )
            try:
                os.chdir(project)
                with patch("laddr.cli.commands.add.add_worker_to_compose"):
                    _create_agent_files(
                        agent_name="research_helper",
                        role=role,
                        goal=goal,
                        backstory=backstory,
                        llm_provider="gemini",
                        llm_model="gemini-2.5-flash",
                    )
            finally:
                os.chdir(original_directory)

            source = (project / "agents" / "research_helper.py").read_text(
                encoding="utf-8"
            )
            tree = ast.parse(source)
            assignment = next(
                node
                for node in tree.body
                if isinstance(node, ast.Assign)
                and any(
                    isinstance(target, ast.Name)
                    and target.id == "research_helper"
                    for target in node.targets
                )
            )
            keywords = {
                keyword.arg: ast.literal_eval(keyword.value)
                for keyword in assignment.value.keywords
                if keyword.arg in {"role", "goal", "backstory"}
            }

            self.assertEqual(keywords, {
                "role": role,
                "goal": goal,
                "backstory": backstory,
            })

    def test_existing_worker_service_is_not_added_twice(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir)
            compose_path = project / "docker-compose.yml"
            original = {
                "services": {
                    "research_helper_worker": {"image": "existing-worker"}
                }
            }
            compose_path.write_text(yaml.safe_dump(original), encoding="utf-8")

            add_worker_to_compose(project, "research_helper")

            updated = yaml.safe_load(compose_path.read_text(encoding="utf-8"))
            self.assertEqual(updated, original)


if __name__ == "__main__":
    unittest.main()
