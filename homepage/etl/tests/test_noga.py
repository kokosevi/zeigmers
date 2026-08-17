import json

import pytest

from zeigmers_etl import config, noga

SECTION_RANGES = {
    "A": range(1, 4), "B": range(5, 10), "C": range(10, 34), "D": range(35, 36),
    "E": range(36, 40), "F": range(41, 44), "G": range(45, 48), "H": range(49, 54),
    "I": range(55, 57), "J": range(58, 64), "K": range(64, 67), "L": range(68, 69),
    "M": range(69, 76), "N": range(77, 83), "O": range(84, 85), "P": range(85, 86),
    "Q": range(86, 89), "R": range(90, 94), "S": range(94, 97), "T": range(97, 99),
    "U": range(99, 100),
}
ALL_DIVISIONS = [d for r in SECTION_RANGES.values() for d in r]


@pytest.fixture(scope="module")
def table():
    return noga.load_table()


def test_has_eleven_groups(table):
    assert table.group_count == 11


def test_group_colors_are_unique(table):
    colors = [g.color.lower() for g in table.groups]
    assert len(set(colors)) == len(colors)


def test_no_group_uses_the_reserved_grey(table):
    assert config.UNKNOWN_COLOR_HEX.lower() not in {g.color.lower() for g in table.groups}


def test_colors_are_six_digit_hex(table):
    for g in table.groups:
        assert len(g.color) == 7 and g.color.startswith("#")
        int(g.color[1:], 16)


def test_every_noga_2008_division_is_mapped(table):
    missing = [d for d in ALL_DIVISIONS if d not in table.division_to_group]
    assert missing == [], f"nicht abgedeckte Abteilungen: {missing}"


def test_divisions_map_to_correct_sections(table):
    for section, rng in SECTION_RANGES.items():
        for division in rng:
            assert table.division_to_section[division] == section


def test_group_index_is_in_range(table):
    for division in ALL_DIVISIONS:
        assert 0 <= table.group_index(division) < table.group_count


def test_unknown_division_raises(table):
    with pytest.raises(KeyError):
        table.group_index(4)


def test_industrie_group_covers_manufacturing(table):
    # Abteilung 28 (Maschinenbau) gehört zu Abschnitt C, Gruppe "industrie"
    idx = table.group_index(28)
    assert table.groups[idx].key == "industrie"


def test_handel_group(table):
    assert table.groups[table.group_index(47)].key == "handel"


def test_unknown_color_matches_config(table):
    # noga_groups.json und config.UNKNOWN_COLOR_HEX sind zwei Quellen für denselben
    # Wert; load_table muss Abweichungen erkennen, damit sie nicht auseinanderlaufen.
    assert table.unknown_color.lower() == config.UNKNOWN_COLOR_HEX.lower()


def test_mismatched_unknown_color_raises(tmp_path):
    bad = {
        "nomenclature": "NOGA 2008",
        "unknownColor": "#123456",
        "sections": {"A": "1-3"},
        "groups": [
            {
                "key": "landwirtschaft",
                "label": "Land- und Forstwirtschaft",
                "color": "#009E73",
                "sections": ["A"],
            }
        ],
    }
    path = tmp_path / "noga_groups.json"
    path.write_text(json.dumps(bad), encoding="utf-8")

    with pytest.raises(ValueError) as exc_info:
        noga.load_table(path)

    message = str(exc_info.value)
    assert "#123456" in message
    assert config.UNKNOWN_COLOR_HEX in message


def test_generate_typescript_roundtrip(table, tmp_path):
    out = tmp_path / "noga.generated.ts"
    noga.generate_typescript(table, out)
    text = out.read_text(encoding="utf-8")

    assert "NICHT VON HAND ÄNDERN" in text
    assert "export const NOGA_GROUPS" in text
    assert "export const UNKNOWN_COLOR" in text
    assert f"export const NOGA_UNKNOWN_INDEX = {config.NOGA_UNKNOWN_INDEX}" in text
    for group in table.groups:
        assert group.label in text
