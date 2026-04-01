import codecs
import re

file_path = r'C:\NOVAPACK CLOUD\public\admin.html'

with codecs.open(file_path, 'r', 'utf-8') as f:
    text = f.read()

pod_start_marker = '<!-- VIEW: POD (PROOF OF DELIVERY)'
# Encontrar el inicio del bloque
idx_start = text.rfind('<!-- ========================================== -->', 0, text.find(pod_start_marker))

if idx_start != -1:
    # Buscar el final basándonos en el script y los divs de cierre
    idx_script_end = text.find('</script>', idx_start)
    idx_end = text.find('</div>', idx_script_end) + 6
    
    pod_block = text[idx_start:idx_end]
    
    # Remover el bloque del documento original
    text_clean = text[:idx_start] + text[idx_end:]
    
    # Insertar el bloque justo después del div main-content
    target_str = '<div class="main-content" id="main-content">'
    ins_idx = text_clean.find(target_str)
    
    if ins_idx != -1:
        ins_idx += len(target_str)
        final_text = text_clean[:ins_idx] + '\n' + pod_block + '\n' + text_clean[ins_idx:]
        
        with codecs.open(file_path, 'w', 'utf-8') as f:
            f.write(final_text)
        print("SUCCESS: Bloque POD movido exitosamente al inicio de main-content.")
    else:
        print("ERROR: No se encontró <div class='main-content' id='main-content'>")
else:
    print("ERROR: No se encontró el marcador del bloque POD.")
