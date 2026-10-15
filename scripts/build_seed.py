#!/usr/bin/env python3
"""Merge the first list and Parts 1-15 into data/seed.json.

- 15 categories (chapters), each with named sections
- the first list's items go into a section called "The essentials" in the matching chapter
- exact duplicates are dropped (the first one seen wins)
- non-vegetarian / egg items are moved to data/excluded-nonveg.txt (the owner is strictly vegetarian, no eggs)

Run:  python3 scripts/build_seed.py <first-list.md> <folder-with-part-files>
"""
import json
import re
import sys
from pathlib import Path

FIRST_LIST = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/mnt/user-data/uploads/bucket-list.md")
PARTS_DIR = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("/home/claude")
OUT = Path(__file__).resolve().parent.parent / "data"

CATEGORIES = [
    ("gujarat", "Gujarat", "Home, from Kutch to Kevadia", "🦁", False),
    ("india", "India", "Every state, every station", "🚂", False),
    ("world", "The World", "Passport stamps wanted", "🌍", False),
    ("food", "Food and drink", "Vegetarian, no eggs, no regrets", "🍛", False),
    ("adventure", "Sports and adventure", "Higher, faster, wetter", "🪂", False),
    ("nature", "Nature and sky", "Tigers, eclipses and the Milky Way", "🌌", False),
    ("creativity", "Creativity and art", "Make things that were not there before", "🎨", False),
    ("learning", "Learning and building", "Skills, products and a business of my own", "🛠️", False),
    ("body-mind", "Body and mind", "Strong, calm and well rested", "🧘", False),
    ("love", "Love, intimacy and pleasure", "Close, curious and consenting", "💞", True),
    ("family", "Family, friends and giving", "The people, and what I give back", "🤝", False),
    ("culture", "Culture and spirituality", "Festivals, pilgrimages and big questions", "🪔", False),
    ("money", "Money and freedom", "Enough, on my own terms", "🧭", False),
    ("fun", "Fun and one of a kind", "Odd, playful and unrepeatable", "🎈", False),
    ("legacy", "Legacy", "What I leave behind", "🌳", False),
]

PART_FILES = sorted(PARTS_DIR.glob("[0-1][0-9]-*.md"))

NONVEG = re.compile(
    r"\b(chicken|mutton|lamb|pork|beef|prawns?|shrimps?|crabs?|lobsters?|oysters?|hilsa|bombay duck|"
    r"peking duck|duck|kebabs?|kababs?|tunday|wazwan|nihari|haleem|salami|sashimi|sushi|steaks?|bacon|"
    r"ham|sausages?|seafood|omelettes?|meat|insects?|fish curry|fish and chips|fish sauce|fish stock|"
    r"eggs?|biryani|vindaloo|sorpotel|bebinca|stroopwafels?)\b",
    re.I,
)
VEG_RESCUE = re.compile(r"\b(veg|vegetarian|vegan|paneer|eggless|egg-free|no egg|without egg|no meat|no fish|meatless)\b", re.I)
RENAME = {
    "Eat Parsi food in Navsari": "Eat vegetarian Parsi food in Navsari",
    "Eat pasta in Italy": "Eat eggless pasta in Italy",
    "Eat Hyderabadi dum biryani and haleem": None,
    "Eat kebabs and baklava in Istanbul": "Eat baklava in Istanbul",
    "Do a Biryani trail": "Do a vegetarian biryani trail",
}
# Titles the keyword filter would catch by mistake.
ALLOW = {
    "Eat mapo tofu without meat",
    "See a stick insect",
    "Check for hidden animal ingredients: gelatin, fish sauce, lard, rennet, egg wash, mayonnaise",
}


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", s.lower())).strip()


def parse(path):
    """Return list of (section_name, [titles])."""
    sections, current = [], None
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^##\s+(?:[A-Z0-9]+\.\s+)?(.*)$", line)
        if m:
            current = (m.group(1).strip(), [])
            sections.append(current)
            continue
        m = re.match(r"^- \[[ xX]\]\s+(.*\S)\s*$", line)
        if m and current is not None:
            current[1].append(m.group(1))
    return sections


def first_list_by_number(path):
    out = {}
    num = None
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^##\s+(\d+)\.", line)
        if m:
            num = int(m.group(1))
            out[num] = []
            continue
        m = re.match(r"^- \[[ xX]\]\s+(.*\S)\s*$", line)
        if m and num is not None:
            out[num].append(m.group(1))
    return out


def main():
    seen = set()
    excluded = []
    dropped_dupes = 0
    cats = []
    first = first_list_by_number(FIRST_LIST)

    assert len(PART_FILES) == 15, f"expected 15 part files, found {len(PART_FILES)}"

    def accept(title, cat_name):
        nonlocal dropped_dupes
        title = RENAME.get(title, title)
        if title is None:
            excluded.append(f"[{cat_name}] Eat Hyderabadi dum biryani and haleem")
            return None
        if title not in ALLOW and NONVEG.search(title) and not VEG_RESCUE.search(title):
            excluded.append(f"[{cat_name}] {title}")
            return None
        k = norm(title)
        if k in seen:
            dropped_dupes += 1
            return None
        seen.add(k)
        return title

    for i, (slug, title, tagline, emoji, private) in enumerate(CATEGORIES, start=1):
        sections = []
        ess = []
        for t in first.get(i, []):
            a = accept(t, title)
            if a:
                ess.append(a)
        if ess:
            sections.append({"name": "The essentials", "items": ess})
        for name, items in parse(PART_FILES[i - 1]):
            kept = []
            for t in items:
                a = accept(t, title)
                if a:
                    kept.append(a)
            if kept:
                sections.append({"name": name, "items": kept})
        cats.append(
            {
                "slug": slug,
                "title": title,
                "tagline": tagline,
                "emoji": emoji,
                "is_private": private,
                "sections": sections,
            }
        )

    OUT.mkdir(exist_ok=True)
    (OUT / "seed.json").write_text(json.dumps({"version": 1, "categories": cats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "excluded-nonveg.txt").write_text(
        "Items left out of the starter list because they are not vegetarian or contain egg.\n"
        "Add any back from inside the app if you want them.\n\n" + "\n".join(excluded) + "\n",
        encoding="utf-8",
    )

    total = 0
    for c in cats:
        n = sum(len(s["items"]) for s in c["sections"])
        total += n
        print(f"{c['title']:<34} {len(c['sections']):>3} sections {n:>5} items")
    print(f"TOTAL {total} items, {dropped_dupes} duplicates dropped, {len(excluded)} excluded")


if __name__ == "__main__":
    main()
