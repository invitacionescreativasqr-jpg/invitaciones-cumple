"""Retira invitaciones según su vigencia; HTML antiguos: 30 días (Perú)."""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import json
import re
import shutil

PROTECTED = {'index.html', 'demo.html', '404.html'}
BASE_FILES = ['index.html', 'invite-codec.js', 'demo.html', '.nojekyll']

def read_expiry(event_date, header=''):
    marker=re.search(r'<meta name="invitation-expiry-date" content="([^"]*)">',header)
    if not marker:
        if 'name="invitation-expiry-date"' in header:raise ValueError('Marcador de vigencia inválido.')
        return date.fromisoformat(event_date)+timedelta(days=30)
    if marker.group(1)=='never':return None
    expiry=date.fromisoformat(marker.group(1))
    if expiry<date.fromisoformat(event_date):raise ValueError('La retirada no puede ser anterior al evento.')
    return expiry

def prepare(root, today=None):
    root=Path(root).resolve()
    today=today or datetime.now(timezone(timedelta(hours=-5))).date()
    manifest=json.loads((root/'invitaciones-publicadas.json').read_text(encoding='utf-8'))
    if manifest.get('version')!=1 or not isinstance(manifest.get('invitations'),list):
        raise ValueError('Registro de invitaciones inválido.')
    # Exportaciones autónomas: su fecha está marcada en el HTML, sin editar el registro.
    known={item.get('file') for item in manifest['invitations']}
    for exported in list(root.glob('cars-*.html'))+list(root.glob('pvz-*.html'))+list(root.glob('dbz-*.html'))+list(root.glob('timonpumba-*.html'))+list(root.glob('reyleon-*.html'))+list(root.glob('frozen-*.html')):
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
        event_date=item['event_date']
        header=''
        if target.is_file():
            header=target.read_text(encoding='utf-8').split('</head>',1)[0]
            event_marker=re.search(r'<meta name="invitation-event-date" content="(\d{4}-\d{2}-\d{2})">',header)
            if event_marker:event_date=event_marker.group(1)
        expires=read_expiry(event_date,header)
        records.append((name,target,expires))
    retired=[]
    for name,target,expires in records:
        if expires is not None and today>=expires and target.exists():
            if not target.is_file():raise ValueError('Se esperaba un archivo: '+name)
            target.unlink();retired.append(name)
    # Solo estos archivos llegan al artefacto público, nunca scripts ni metadatos.
    output=root/'_site'
    if output.is_symlink() or output.resolve().parent!=root:raise ValueError('Directorio de publicación no permitido.')
    output.mkdir(exist_ok=True)
    for previous in output.iterdir():
        if previous.is_symlink() or not previous.is_file():raise ValueError('Contenido inesperado en _site.')
        previous.unlink()
    public_files=BASE_FILES+[name for name in ['pvz.html','dbz.html'] if (root/name).is_file()]
    for name in public_files:
        source=root/name
        if not source.is_file() or source.is_symlink():raise ValueError('Falta archivo compartido: '+name)
        shutil.copyfile(source,output/name)
    for name,target,expires in records:
        if (expires is None or today<expires) and target.is_file():shutil.copyfile(target,output/name)
    print('Fecha de Perú:',today.isoformat())
    print('Retiradas:',', '.join(retired) if retired else 'ninguna')
    return retired

if __name__=='__main__':prepare(Path(__file__).resolve().parent)
