"""Retira únicamente invitaciones registradas tras 30 días (fecha de Perú)."""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import json
import re
import shutil

PROTECTED = {'index.html', 'demo.html', '404.html'}
BASE_FILES = ['index.html', 'invite-codec.js', 'demo.html', '.nojekyll']

def prepare(root, today=None):
    root=Path(root).resolve()
    today=today or datetime.now(timezone(timedelta(hours=-5))).date()
    manifest=json.loads((root/'invitaciones-publicadas.json').read_text(encoding='utf-8'))
    if manifest.get('version')!=1 or not isinstance(manifest.get('invitations'),list):
        raise ValueError('Registro de invitaciones inválido.')
    # Exportaciones autónomas: su fecha está marcada en el HTML, sin editar el registro.
    known={item.get('file') for item in manifest['invitations']}
    for exported in root.glob('cars-*.html'):
        if exported.name in known or exported.is_symlink() or not exported.is_file():continue
        header=exported.read_text(encoding='utf-8').split('</head>',1)[0]
        marker=re.search(r'<meta name="invitation-event-date" content="(\d{4}-\d{2}-\d{2})">',header)
        if marker:manifest['invitations'].append({'file':exported.name,'event_date':marker.group(1)})
    records=[]; seen=set()
    # Validar todos los registros antes de retirar cualquier archivo.
    for item in manifest['invitations']:
        name=item['file']
        if not isinstance(name,str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}\.html',name) or name in PROTECTED or name in seen:
            raise ValueError('Archivo de invitación no permitido: '+str(name))
        seen.add(name)
        target=root/name
        if target.is_symlink() or target.resolve().parent!=root:
            raise ValueError('La invitación debe ser un archivo normal dentro del proyecto.')
        expires=date.fromisoformat(item['event_date'])+timedelta(days=30)
        records.append((name,target,expires))
    retired=[]
    for name,target,expires in records:
        if today>=expires and target.exists():
            if not target.is_file():raise ValueError('Se esperaba un archivo: '+name)
            target.unlink();retired.append(name)
    # Solo estos archivos llegan al artefacto público, nunca scripts ni metadatos.
    output=root/'_site'
    if output.is_symlink() or output.resolve().parent!=root:raise ValueError('Directorio de publicación no permitido.')
    output.mkdir(exist_ok=True)
    for previous in output.iterdir():
        if previous.is_symlink() or not previous.is_file():raise ValueError('Contenido inesperado en _site.')
        previous.unlink()
    for name in BASE_FILES:
        source=root/name
        if not source.is_file() or source.is_symlink():raise ValueError('Falta archivo compartido: '+name)
        shutil.copyfile(source,output/name)
    for name,target,expires in records:
        if today<expires and target.is_file():shutil.copyfile(target,output/name)
    print('Fecha de Perú:',today.isoformat())
    print('Retiradas:',', '.join(retired) if retired else 'ninguna')
    return retired

if __name__=='__main__':prepare(Path(__file__).resolve().parent)
