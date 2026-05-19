# Proyecto Imperia CRM

CRM web basado en:
- `Base de datos Partum.xlsx`
- `JAVA.docx`

## Qué incluye
- Dashboard de KPIs operativos
- Pipeline tipo Kanban por estado
- Tabla maestra de tareas con filtros y búsqueda
- Vista por cliente
- Vista por colaborador
- Bandeja de alertas urgentes basada en lógica de recordatorios
- Estilo visual Material + Liquid Glass, responsive

## Cómo correr
1. Abre terminal en esta carpeta.
2. Ejecuta:

```powershell
python -m http.server 4173
```

3. Abre `http://127.0.0.1:4173`.

## Regenerar datos desde el Excel/DOCX
Si cambian los archivos base, vuelve a generar `data/data.json`:

```powershell
"C:\Users\Diseño Partum Design\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\extract_data.py
```

## Estructura
- `index.html`: layout principal
- `styles.css`: tema visual y responsive
- `app.js`: lógica de CRM (filtros, tabs, render)
- `data/data.json`: dataset generado desde Excel
- `scripts/extract_data.py`: extractor de datos
