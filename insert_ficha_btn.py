filepath = r"c:\NOVAPACK CLOUD\public\admin.html"
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove lines 12038 and 12039 (0-indexed: 12037, 12038) - duplicates with bad escaping
# Line 12037 (0-indexed) contains "openFichaCliente===''function''" (bad escape)
# Line 12038 (0-indexed) also contains the same

# Let's find and remove the two bad duplicate lines
to_remove = []
for i in range(len(lines)):
    if "openFichaCliente===''function''" in lines[i]:
        to_remove.append(i)

print(f"Found {len(to_remove)} bad lines to remove: {to_remove}")

# Remove in reverse order to maintain indices
for idx in reversed(to_remove):
    print(f"  Removing line {idx+1}: {lines[idx].strip()[:80]}")
    del lines[idx]

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done! Removed duplicate lines.")
