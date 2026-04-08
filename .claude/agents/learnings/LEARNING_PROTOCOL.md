# Protocolo de Aprendizaje — SaasFacturacion Agents

## Regla Principal

Cuando un agente resuelve un problema no trivial, descubre una regla de negocio confirmada,
o toma una decisión arquitectónica importante, **debe guardar ese aprendizaje** en el archivo
correspondiente de este directorio.

## Archivos de Learnings

| Archivo | Contenido |
|---------|-----------|
| `angular_learnings.md` | Patrones Angular/CoreUI, signals, errores resueltos |
| `firebase_learnings.md` | Queries Firestore, anti-patterns, performance |
| `business_learnings.md` | Reglas SRI confirmadas, casos borde Ecuador |
| `sri_learnings.md` | XML rechazados, claves de acceso, errores SRI |
| `architecture_learnings.md` | Decisiones de estructura tomadas y por qué |
| `security_learnings.md` | Vulnerabilidades encontradas y fixes |
| `cloud_functions_learnings.md` | Patrones de Functions, errores resueltos |
| `devops_learnings.md` | Issues de build/deploy y soluciones |

## Formato de Cada Learning

```markdown
## [Fecha] — Título breve

**Contexto:** Qué se estaba haciendo
**Problema/Descubrimiento:** Qué pasó o se aprendió
**Solución/Regla:** Qué se debe hacer
**Archivos afectados:** (si aplica)
```

## Triggers para Guardar

| Evento | Guardar en |
|--------|-----------|
| SRI devuelve error de validación XML | `sri_learnings.md` |
| Bug en cálculo de IVA/totales | `business_learnings.md` |
| Error de Firestore resuelto | `firebase_learnings.md` |
| Patrón Angular que no funcionaba | `angular_learnings.md` |
| Decisión de arquitectura tomada | `architecture_learnings.md` |
| Vulnerabilidad de seguridad encontrada | `security_learnings.md` |
| Cloud Function que fallaba en prod | `cloud_functions_learnings.md` |
| Deploy que falló + solución | `devops_learnings.md` |

## Ciclo de Vida

```
Bug resuelto / Decisión tomada
  → Guardar en learnings/[agente]_learnings.md
  → Si se repite 2+ veces → Promover al archivo de definición del agente
  → El agente lo aplica en todas las sesiones futuras
```

## Cómo Activar el Guardado de Learnings

```
"Guarda lo que aprendimos de esta implementación"
"Registra este fix en los learnings del Firebase Agent"
"Actualiza los learnings del SRI Agent con este error de XML"
```

O Claude lo propone automáticamente al resolver bugs no triviales.
