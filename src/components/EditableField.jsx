import { useEffect, useRef, useState } from 'react';

// Campo controlado con estado LOCAL que se desconecta del store global
// mientras el usuario está escribiendo. Evita el bug de "el texto se borra"
// cuando un refresh de realtime pisa el value mientras el input está focused
// O mientras un guardado optimista está en vuelo.
//
// Flujo:
//   - El estado local arranca con `value`.
//   - onChange ↦ actualiza estado local + dispara onSave(v) debounced (500ms).
//   - Al hacer blur, flush inmediato si hay cambio pendiente.
//   - Tras flush, marca pendingAck=true: hasta que el value externo coincida
//     con lo último guardado (= la BD nos devolvió nuestro valor) ignoramos
//     cualquier value entrante distinto (refresh stale por realtime de otro
//     cambio mientras updateProject estaba en vuelo). Timeout de seguridad
//     a 5s por si el save falla silenciosamente.
//   - Si `value` cambia desde fuera y el input no está focused ni hay save
//     en vuelo, sincroniza. Si está focused, ignora el cambio externo (lo que
//     el usuario está escribiendo gana).
function useDebouncedField(value, onSave, delay = 500) {
  const [local, setLocal] = useState(value ?? '');
  const ref = useRef(null);
  const timer = useRef(null);
  const lastSaved = useRef(value ?? '');
  const pendingAck = useRef(false);
  const ackTimer = useRef(null);
  // Refs vivos para que el cleanup de desmontaje pueda flushear lo último
  // que el usuario escribió aunque la prop onSave haya cambiado de identidad
  // en cada render.
  const localRef = useRef(local);
  const onSaveRef = useRef(onSave);
  useEffect(() => { localRef.current = local; }, [local]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  useEffect(() => {
    const v = value ?? '';
    const focused = ref.current && document.activeElement === ref.current;
    if (focused) return;
    if (pendingAck.current) {
      if (v === lastSaved.current) {
        pendingAck.current = false;
        clearTimeout(ackTimer.current);
      } else {
        return;
      }
    }
    setLocal(v);
    lastSaved.current = v;
  }, [value]);

  const flush = (v) => {
    if (v !== lastSaved.current) {
      lastSaved.current = v;
      pendingAck.current = true;
      clearTimeout(ackTimer.current);
      ackTimer.current = setTimeout(() => { pendingAck.current = false; }, 5000);
      onSaveRef.current?.(v);
    }
  };

  const handleChange = (e) => {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(v), delay);
  };

  const handleBlur = () => {
    clearTimeout(timer.current);
    flush(local);
  };

  // Al desmontar: si el usuario tecleó algo que aún no se había debounceado
  // (cambia de tab Información→Seguimiento sin pausar 500ms, navega a otro
  // proyecto, etc.) flusheamos sincrónicamente para no perder el texto.
  // Sin esto, switchear tabs mientras se escribe parecía "borrar" lo escrito.
  useEffect(() => () => {
    clearTimeout(timer.current);
    clearTimeout(ackTimer.current);
    if (localRef.current !== lastSaved.current) {
      lastSaved.current = localRef.current;
      onSaveRef.current?.(localRef.current);
    }
  }, []);

  return { ref, local, handleChange, handleBlur };
}

export function EditableField({ value, onSave, delay = 500, ...rest }) {
  const { ref, local, handleChange, handleBlur } = useDebouncedField(value, onSave, delay);
  return <input ref={ref} value={local} onChange={handleChange} onBlur={handleBlur} {...rest} />;
}

export function EditableTextarea({ value, onSave, delay = 500, ...rest }) {
  const { ref, local, handleChange, handleBlur } = useDebouncedField(value, onSave, delay);
  return <textarea ref={ref} value={local} onChange={handleChange} onBlur={handleBlur} {...rest} />;
}
