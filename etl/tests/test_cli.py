import inspect
import re

from draufsicht_etl import cli


def test_every_command_has_a_dispatch_path():
    """`COMMANDS` (und damit `--help`) muss mit dem Dispatch in `main()`
    übereinstimmen. Ohne diesen Test kann ein Kommando in `COMMANDS` auftauchen
    und beworben werden, ohne dass `main()` es behandelt — es fällt dann still
    auf den "noch nicht implementiert"-Zweig, der trotzdem 0 zurückgibt, als
    wäre der Lauf erfolgreich gewesen. Genau das war bei `sanity-map`
    passiert (siehe Abschluss-Review, Finding I1)."""
    source = inspect.getsource(cli.main)
    missing = [
        name for name in cli.COMMANDS
        if not re.search(rf'["\']{re.escape(name)}["\']', source)
    ]
    assert not missing, (
        f"Kommandos ohne Dispatch-Zweig in main(): {missing}"
    )


def test_commands_dict_matches_help_output(capsys):
    parser = cli.build_parser()
    try:
        parser.parse_args(["--help"])
    except SystemExit:
        pass
    out = capsys.readouterr().out
    for name in cli.COMMANDS:
        assert name in out
