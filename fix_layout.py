import re

path = r'c:\NOVAPACK CLOUD\public\admin.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# The contamination pattern is:
# <!-- MODAL REASIGNAR REPARTIDOR --> ... all modals + <script>...JS...</script> + </body>
# This block was injected 5 times. We need to keep ONLY the LAST occurrence
# (just before the real </body></html>).

# Define the marker strings
MODAL_START = '    <!-- MODAL REASIGNAR REPARTIDOR -->'
MODAL_BLOCK_END = '</script>\r\n\r\n</body>'  # The injected block always ends with </script> then </body>

# Find ALL occurrences
positions = []
search_start = 0
while True:
    idx = html.find(MODAL_START, search_start)
    if idx == -1:
        break
    positions.append(idx)
    search_start = idx + 1

print(f"Found {len(positions)} modal injection points at character positions.")

if len(positions) <= 1:
    print("Only 0-1 occurrences found. Nothing to deduplicate.")
else:
    # Keep ONLY the last occurrence. Remove all others.
    # For each occurrence except the last, find the end of its block
    # The block pattern: starts with MODAL_START and ends with </script>\r\n\r\n</body>
    
    # Process from last-to-first (to not mess up indices)
    removals = []
    for i in range(len(positions) - 1):  # Skip the last one
        start = positions[i]
        # Find the end of this block: look for </body> after the modal start
        # The injected block ends with: </script>\n\n</body>
        block_end_marker = '</body>'
        end_search = html.find(block_end_marker, start)
        if end_search != -1:
            end = end_search + len(block_end_marker)
            # Skip any trailing whitespace/newlines
            while end < len(html) and html[end] in '\r\n ':
                end += 1
            removals.append((start, end))
            print(f"  Block {i+1}: chars {start}-{end} (len={end-start})")
    
    # Apply removals from end to start
    for start, end in reversed(removals):
        html = html[:start] + html[end:]
    
    print(f"Removed {len(removals)} duplicate injection blocks.")

# Now verify we have exactly 1 modal block left
remaining = html.count(MODAL_START)
print(f"Remaining modal blocks: {remaining}")

# Also verify the real </body> is still at the end
last_body = html.rfind('</body>')
print(f"Real </body> at position {last_body} (total length: {len(html)})")

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)

print("Layout fix complete.")
