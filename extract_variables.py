#!/usr/bin/env python3
"""
Script to extract all dynamic variables from email templates.
Variables are in the format: {{$json.variable_name}}
"""

import os
import re
from collections import defaultdict
from pathlib import Path


def extract_variables(file_path):
    """Extract all {{$json.variable}} patterns from a file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Pattern to match {{$json.variable_name}}
        pattern = r'\{\{\$json\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}'
        matches = re.findall(pattern, content)

        return matches
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return []


def scan_templates(base_dir):
    """Scan all HTML files in the directory and extract variables."""
    base_path = Path(base_dir)

    # Dictionary to track which files use which variables
    file_variables = defaultdict(list)
    all_variables = set()

    # Find all HTML files
    html_files = list(base_path.rglob("*.html"))

    print(f"Found {len(html_files)} HTML template files\n")

    for html_file in sorted(html_files):
        relative_path = html_file.relative_to(base_path)
        variables = extract_variables(html_file)

        if variables:
            file_variables[str(relative_path)] = variables
            all_variables.update(variables)

    return file_variables, sorted(all_variables)


def main():
    templates_dir = "Email Templates"

    if not os.path.exists(templates_dir):
        print(f"Error: Directory '{templates_dir}' not found!")
        return

    print("=" * 80)
    print("EMAIL TEMPLATE VARIABLE EXTRACTOR")
    print("=" * 80)
    print()

    file_variables, unique_variables = scan_templates(templates_dir)

    # Print unique variables
    print("=" * 80)
    print(f"UNIQUE VARIABLES FOUND: {len(unique_variables)}")
    print("=" * 80)
    print()

    for i, var in enumerate(unique_variables, 1):
        print(f"{i:2d}. {{{{$json.{var}}}}}")

    print()
    print("=" * 80)
    print("VARIABLES BY FILE")
    print("=" * 80)
    print()

    for file_path, variables in sorted(file_variables.items()):
        print(f"\nFile: {file_path}")
        print(f"   Variables ({len(set(variables))} unique):")
        for var in sorted(set(variables)):
            count = variables.count(var)
            print(f"      - {var} (used {count}x)")

    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total templates scanned: {len(file_variables)}")
    print(f"Total unique variables: {len(unique_variables)}")
    print()

    # Variable usage frequency
    var_frequency = defaultdict(int)
    for variables in file_variables.values():
        for var in variables:
            var_frequency[var] += 1

    print("Most frequently used variables:")
    sorted_by_freq = sorted(var_frequency.items(), key=lambda x: x[1], reverse=True)
    for var, count in sorted_by_freq[:10]:
        print(f"  - {var}: {count} occurrences")


if __name__ == "__main__":
    main()
