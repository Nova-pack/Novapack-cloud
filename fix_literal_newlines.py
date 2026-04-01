path = r'c:\NOVAPACK CLOUD\public\admin.html'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

fixed = 0
new_lines = []
for i, line in enumerate(lines):
    # Check if line contains a literal \n (backslash + n) that's NOT inside a string literal
    # We look for patterns like: some code;\n  more code
    # But NOT: "some text\n" (inside quotes) or regex
    stripped = line.rstrip('\r\n')
    
    # Check for literal \n at end of line or mid-line (outside quotes)
    if '\\n' in stripped:
        # Split by literal \n and check if it looks like code concatenation
        parts = stripped.split('\\n')
        if len(parts) == 2:
            left = parts[0].rstrip()
            right = parts[1].lstrip()
            
            # If left ends with ; or ) and right starts with code identifier, it's a code split
            if left.endswith(';') and (right.startswith('const ') or right.startswith('let ') or 
                right.startswith('if(') or right.startswith('if (') or
                right.startswith('document.') or right.startswith('async ') or
                right.startswith('window.') or right.startswith('await ') or
                right.startswith('var ') or right.startswith('//') or
                right.startswith('function ')):
                new_lines.append(left + '\r\n')
                new_lines.append('    ' * (len(line) - len(line.lstrip())) // 4 * '    ' + right + '\r\n' if right else '')
                # Use the original indentation
                indent = line[:len(line) - len(line.lstrip())]
                new_lines[-1] = indent + right + '\r\n'
                fixed += 1
                print(f"  Line {i+1}: Split at literal \\n")
                print(f"    LEFT:  {left.strip()[:80]}")
                print(f"    RIGHT: {right.strip()[:80]}")
                continue
    
    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"\nFixed {fixed} literal \\n occurrences.")
