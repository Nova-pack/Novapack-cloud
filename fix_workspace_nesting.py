"""
Fix the PRO billing workspace DOM structure.

Problems:
1. adv-history-workspace (L859) is INSIDE adv-billing-workspace (L706-1083)
2. adv-reports-workspace (L1031) is also INSIDE adv-billing-workspace
3. adv-reports-workspace closes too early (L1037), report controls are loose outside it
4. Extra </div> tags at L1081 and L1083

Fix:
1. Close adv-billing-workspace AFTER the drawer (insert </div> after L856)
2. Move report controls (L1039-1080) INTO adv-reports-workspace (before its close at L1037)
3. Remove loose </div> at L1081 and the marker at L1083
"""

path = r'c:\NOVAPACK CLOUD\public\admin.html'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Step 1: Identify key lines (0-indexed)
# Line 856 (idx 855): </div> that closes the drawer
# Line 857 (idx 856): empty whitespace
# Line 859 (idx 858): adv-history-workspace starts
# Line 1031 (idx 1030): adv-reports-workspace starts  
# Line 1037 (idx 1036): </div> prematurely closes adv-reports-workspace
# Line 1039-1080 (idx 1038-1079): loose report controls
# Line 1081 (idx 1080): extra </div>
# Line 1082 (idx 1081): whitespace
# Line 1083 (idx 1082): </div> <!-- /adv-billing-workspace -->

# Verify key markers
assert 'adv-history-workspace' in lines[858], f"L859 mismatch: {lines[858][:60]}"
assert 'adv-reports-workspace' in lines[1030], f"L1031 mismatch: {lines[1030][:60]}"
assert '</div>' in lines[1036], f"L1037 mismatch: {lines[1036][:60]}"
assert 'rep-date-from' in lines[1041], f"L1042 mismatch: {lines[1041][:60]}"
assert '/adv-billing-workspace' in lines[1082], f"L1083 mismatch: {lines[1082][:60]}"

print("All markers verified ✓")

# Step 2: Extract the report controls block (L1039-1080, idx 1038-1079)
report_controls = lines[1038:1080]
print(f"Report controls block: {len(report_controls)} lines (L1039-L1080)")

# Step 3: Build new file
new_lines = []

for i, line in enumerate(lines):
    idx1 = i  # 0-indexed
    
    # After line 856 (drawer close), insert closing of adv-billing-workspace
    if idx1 == 856:  # Line 857 - the whitespace after drawer close
        new_lines.append(line)
        new_lines.append('            </div> <!-- /adv-billing-workspace -->\r\n')
        new_lines.append('\r\n')
        continue
    
    # At the premature close of adv-reports-workspace (L1037, idx 1036)
    # Instead of closing it, insert the report controls FIRST, then close
    if idx1 == 1036:
        # Insert report controls inside the workspace
        for rc_line in report_controls:
            new_lines.append(rc_line)
        # Then add the closing div for adv-reports-workspace
        new_lines.append(line)  # the original </div>
        continue
    
    # Skip the loose report controls block (L1039-1080, idx 1038-1079) - already moved
    if 1038 <= idx1 <= 1079:
        continue
    
    # Skip extra </div> at L1081 (idx 1080)
    if idx1 == 1080:
        continue
    
    # Skip the old </div> <!-- /adv-billing-workspace --> at L1083 (idx 1082)
    if idx1 == 1082:
        continue
    
    # Skip whitespace line at L1082 (idx 1081)
    if idx1 == 1081:
        continue
    
    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"New total lines: {len(new_lines)} (was {len(lines)})")
print("Done! Workspace structure fixed.")
