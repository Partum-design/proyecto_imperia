# Proyecto Imperia CRM

CRM funcional y personalizable, listo para Vercel.

## Funcionalidades
- CRUD completo de tareas
- CRUD completo de clientes
- CRUD completo de miembros de equipo
- Calendario editable (crear, editar, borrar eventos)
- Cambio de status y avance de tareas en tiempo real
- Alertas visuales por vencimiento
- Prueba de envio de correo de alertas por API
- Persistencia local en navegador (localStorage)

## Correr local
```powershell
python -m http.server 4173
```
Abrir: `http://127.0.0.1:4173`

## Prueba de correo en Vercel
Endpoint: `POST /api/send-test-email`

Variables de entorno recomendadas en Vercel:
- `SMTP_HOST`
- `SMTP_PORT` (587 o 465)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Si faltan variables SMTP, el endpoint responde en **modo demo** con preview del payload.

## Fuente de datos inicial
- `data/data.json` (generado desde tu Excel y DOCX)

## Estructura
- `index.html` interfaz principal
- `styles.css` tema visual Material + Liquid Glass
- `app.js` logica CRM y CRUD
- `api/send-test-email.js` envio de correo de prueba
- `data/data.json` semilla inicial
- `scripts/extract_data.py` regenera semilla desde Excel
