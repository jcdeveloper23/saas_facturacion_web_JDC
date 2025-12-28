# 🔥 Diagnóstico y Solución - Reglas de Firestore para city_search_analytics

## 📋 Paso 1: Verificar la Consola del Navegador

Abre tu aplicación web y ve a la página de "Búsquedas de Ciudades". Luego:

1. Abre la **Consola de Chrome** (F12)
2. Revisa los mensajes de console.log que ahora aparecerán:
   - ✅ Usuario autenticado: [email]
   - 🔑 UID: [user_id]
   - 🎫 Custom Claims: {...}
   - 👤 userRol: [valor]
   - 🔍 Consultando city_search_analytics...
   - ✅ Logs recibidos: [número]

3. Si ves un **error**, copia el mensaje completo

---

## 🔧 Paso 2: Reglas de Firestore Correctas

Ve a **Firebase Console** → **Firestore Database** → **Reglas**

### Opción A: Si usas Custom Claims con `userRol`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Regla para city_search_analytics
    match /city_search_analytics/{document} {
      // Solo administradores pueden leer
      allow read: if request.auth != null &&
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.userRol == 0;
      // Cualquier usuario autenticado puede escribir
      allow write: if request.auth != null;
    }

  }
}
```

### Opción B: Lectura basada SOLO en autenticación (más simple)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Regla para city_search_analytics
    match /city_search_analytics/{document} {
      // Cualquier usuario autenticado puede leer y escribir
      allow read, write: if request.auth != null;
    }

  }
}
```

### Opción C: Verificar userRol desde documento de usuario

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Función helper para verificar si es admin
    function isAdmin() {
      return request.auth != null &&
             exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.userRol == 0;
    }

    // Regla para city_search_analytics
    match /city_search_analytics/{document} {
      allow read: if isAdmin();
      allow write: if request.auth != null;
    }

  }
}
```

---

## 🐛 Problemas Comunes y Soluciones

### Problema 1: "Missing or insufficient permissions"

**Causa**: El usuario no está autenticado o las reglas son muy restrictivas

**Solución**:
1. Usa la **Opción B** temporalmente para verificar que funciona
2. Si funciona con Opción B, el problema está en la verificación de userRol
3. Verifica en la consola del navegador el valor de `userRol`

### Problema 2: "The query requires an index"

**Causa**: Necesitas crear un índice compuesto para `orderBy`

**Solución**:
1. Firebase te mostrará un enlace en el error de consola
2. Haz clic en el enlace para crear el índice automáticamente
3. O crea el índice manualmente:
   - Colección: `city_search_analytics`
   - Campo: `timestamp` - Descendente
   - Estado de consulta: Enabled

### Problema 3: userRol está en Custom Claims, no en documento

**Causa**: El campo `userRol` está en el token JWT, no en Firestore

**Solución**: Usa esta regla que lee del token:

```javascript
match /city_search_analytics/{document} {
  allow read: if request.auth != null && request.auth.token.userRol == 0;
  allow write: if request.auth != null;
}
```

### Problema 4: userRol tiene nombre diferente

**Posibles nombres**:
- `userRol`
- `user_rol`
- `role`
- `userRole`
- `admin`
- `isAdmin`

**Verifica en la consola del navegador** cuál es el nombre exacto y ajusta la regla.

---

## ✅ Verificación Final

Después de aplicar las reglas:

1. **Publica** las reglas en Firebase
2. **Recarga** tu aplicación web (Ctrl + Shift + R)
3. Ve a `/city-search-analytics`
4. Revisa la consola del navegador:
   - Deberías ver: "✅ Logs recibidos: X"
   - Si ves un error, cópialo completo

---

## 📞 Si sigue sin funcionar

Envíame:
1. El mensaje completo del error de la consola
2. Los valores de `Custom Claims` que aparecen en console.log
3. El valor de `userRol` que aparece en console.log
4. La estructura de tu documento de usuario en Firestore

Con esa información podré darte la solución exacta! 🚀
