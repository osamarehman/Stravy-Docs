"""
Extract complete schema from new Airtable base.

This script connects to the new Airtable base and extracts:
- All table names and IDs
- All field definitions (names, types, configurations)
- Linked record relationships
- Record counts for each table

Outputs:
- new_base_schema.json: Complete schema in JSON format
- Console output: Human-readable summary
"""

import os
import sys
import json
from dotenv import load_dotenv
from pyairtable import Api
from tabulate import tabulate
from datetime import datetime

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Load environment variables
load_dotenv()

# Configuration
NEW_BASE_ID = os.getenv('NEW_BASE_ID')
AIRTABLE_NEW_PAT = os.getenv('AIRTABLE_NEW_PAT')

if not NEW_BASE_ID or not AIRTABLE_NEW_PAT:
    print("❌ Error: NEW_BASE_ID or AIRTABLE_NEW_PAT not found in .env file")
    exit(1)

print(f"🔍 Extracting schema from Airtable base: {NEW_BASE_ID}")
print(f"📅 Extraction started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

# Initialize Airtable API
api = Api(AIRTABLE_NEW_PAT)
base = api.base(NEW_BASE_ID)

# Get base schema
print("📊 Fetching base schema...")
schema = base.schema()

# Extract table information
tables_data = []
relationships = []
total_records = 0

print(f"\n✅ Found {len(schema.tables)} tables\n")

for table_schema in schema.tables:
    table_name = table_schema.name
    table_id = table_schema.id

    print(f"📋 Processing table: {table_name} ({table_id})")

    # Get table instance for record count
    table = base.table(table_name)

    # Count records (limit to first 100 for speed)
    try:
        records = table.all(max_records=100)
        record_count = len(records)
        has_more = len(records) == 100
        count_display = f"{record_count}+" if has_more else str(record_count)
    except Exception as e:
        print(f"  ⚠️  Warning: Could not count records: {e}")
        record_count = 0
        count_display = "Error"

    total_records += record_count

    # Extract field information
    fields_data = []
    for field in table_schema.fields:
        field_info = {
            'name': field.name,
            'type': field.type,
            'id': field.id
        }

        # Add field-specific options
        if hasattr(field, 'options') and field.options:
            field_info['options'] = field.options

        # Track linked record relationships
        if field.type == 'multipleRecordLinks':
            relationship = {
                'source_table': table_name,
                'field_name': field.name,
                'linked_table_id': getattr(field.options, 'linkedTableId', None) if field.options else None,
                'is_reversed': getattr(field.options, 'isReversed', False) if field.options else False
            }
            relationships.append(relationship)

        fields_data.append(field_info)

    table_data = {
        'name': table_name,
        'id': table_id,
        'record_count': record_count,
        'record_count_display': count_display,
        'field_count': len(fields_data),
        'fields': fields_data,
        'description': getattr(table_schema, 'description', None)
    }

    tables_data.append(table_data)
    print(f"  ✓ {len(fields_data)} fields, {count_display} records")

# Resolve linked table names for relationships
table_id_to_name = {t['id']: t['name'] for t in tables_data}
for rel in relationships:
    if rel['linked_table_id'] in table_id_to_name:
        rel['linked_table_name'] = table_id_to_name[rel['linked_table_id']]

# Create output structure
output = {
    'extraction_metadata': {
        'base_id': NEW_BASE_ID,
        'extracted_at': datetime.now().isoformat(),
        'total_tables': len(tables_data),
        'total_records_counted': total_records
    },
    'tables': tables_data,
    'relationships': relationships
}

# Save to JSON
output_file = 'new_base_schema.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False, default=str)

print(f"\n💾 Schema saved to: {output_file}")

# Print summary table
print("\n" + "="*80)
print("📊 SCHEMA SUMMARY")
print("="*80 + "\n")

summary_table = []
for table in tables_data:
    summary_table.append([
        table['name'],
        table['field_count'],
        table['record_count_display'],
        '✅ Has Data' if table['record_count'] > 0 else '⚠️  Empty'
    ])

print(tabulate(
    summary_table,
    headers=['Table Name', 'Fields', 'Records', 'Status'],
    tablefmt='grid'
))

# Print relationships
if relationships:
    print(f"\n🔗 RELATIONSHIPS ({len(relationships)} total)\n")
    rel_table = []
    for rel in relationships:
        rel_table.append([
            rel['source_table'],
            rel['field_name'],
            rel.get('linked_table_name', 'Unknown'),
            '↩️  Reversed' if rel['is_reversed'] else '→ Forward'
        ])

    print(tabulate(
        rel_table,
        headers=['Source Table', 'Field Name', 'Linked Table', 'Direction'],
        tablefmt='grid'
    ))

# Print field type summary
print("\n📈 FIELD TYPE DISTRIBUTION\n")
field_types = {}
for table in tables_data:
    for field in table['fields']:
        field_type = field['type']
        field_types[field_type] = field_types.get(field_type, 0) + 1

type_table = [[ft, count] for ft, count in sorted(field_types.items(), key=lambda x: x[1], reverse=True)]
print(tabulate(type_table, headers=['Field Type', 'Count'], tablefmt='grid'))

print(f"\n✅ Extraction complete!")
print(f"📁 Output saved to: {output_file}")
print(f"📊 Total tables: {len(tables_data)}")
print(f"📝 Total fields: {sum(t['field_count'] for t in tables_data)}")
print(f"📦 Total records counted: {total_records}+")
