path = r'c:\NOVAPACK CLOUD\public\admin.html'
with open(path, 'rb') as f:
    data = f.read()

# We're looking for the literal two-byte sequence: 0x5C 0x6E (backslash + n)
# followed by whitespace and code (not inside string literals where \n is valid)
# 
# The problematic pattern: ;\n  (semicolon, literal backslash, literal n, spaces)
# In bytes: b';\x5c\x6e' followed by spaces

literal_bs_n = b'\\n'

# Count occurrences
count = data.count(literal_bs_n)
print(f"Total literal \\n occurrences in file: {count}")

# We need to be careful - some are legitimate (inside template literals, regex, strings)
# Let's find and examine each one
import re

# Find all positions
pos = 0
positions = []
while True:
    idx = data.find(literal_bs_n, pos)
    if idx == -1:
        break
    # Get context: 40 chars before and after
    before = data[max(0,idx-40):idx].decode('utf-8', errors='replace')
    after = data[idx+2:idx+42].decode('utf-8', errors='replace')
    
    # Line number
    line_num = data[:idx].count(b'\n') + 1
    
    positions.append((idx, line_num, before, after))
    pos = idx + 2

print(f"\nFound {len(positions)} occurrences:\n")

# Classify each occurrence
to_fix = []
for idx, line_num, before, after in positions:
    # Check if it's inside a string literal
    before_trimmed = before.rstrip()
    after_trimmed = after.lstrip()
    
    # Legitimate cases:
    # - Inside single-quoted strings: '...\n...'
    # - Inside double-quoted strings: "...\n..."
    # - Inside template literals: `...\n...`
    # - Inside regex: /...\n.../
    # - Part of \\n in string (already an escaped newline)
    
    # Problematic cases: ends with ; or code and \n appears between statements
    
    # Check if the character right before \n ends a statement
    is_problematic = before_trimmed.endswith((';', '}', ')'))
    # And the character after starts new code
    starts_code = after_trimmed.startswith(('const ', 'let ', 'var ', 'if(', 'if (', 
        'document.', 'async ', 'window.', 'await ', 'function ', '//', 'try', 'for'))
    
    marker = "***FIX***" if (is_problematic and starts_code) else ""
    print(f"  Line {line_num}: ...{before_trimmed[-30:]}\\n{after_trimmed[:30]}... {marker}")
    
    if is_problematic and starts_code:
        to_fix.append(idx)

print(f"\n{len(to_fix)} occurrences to fix.")

# Replace problematic \n with real newline
# Process from end to start to keep indices valid
for idx in reversed(to_fix):
    data = data[:idx] + b'\r\n' + data[idx+2:]

with open(path, 'wb') as f:
    f.write(data)

print(f"Fixed {len(to_fix)} literal \\n -> real newline replacements.")
