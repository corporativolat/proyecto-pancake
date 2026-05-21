import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { projectMaxDayIndex } from '../lib/utils';
import { updatePhase, updateTask } from '../lib/data';
import { reduced } from '../lib/motion';
import { useT } from '../lib/i18n.jsx';
import { useToast } from '../lib/toast';

if (typeof window !== 'undefined') gsap.registerPlugin(Draggable);

export default function GanttCanvas({ project, editable, onChange, onEditTask, scrollerRef }) {
  const { t } = useT();
  const headerRef = useRef(null);
  const bodyRef = useRef(null);
  const [activeWeek, setActiveWeek] = useState(1);
  const maxDayIndex = projectMaxDayIndex(project);
  const outOfRangeLeft = (maxDayIndex + 1) * 28;

  const scrollToWeek = (weekIdx) => {
    const scroller = scrollerRef?.current;
    if (!scroller) return;
    const targetX = weekIdx * 196;
    if (reduced) { scroller.scrollLeft = targetX; return; }
    gsap.to(scroller, { scrollLeft: targetX, duration: 0.55, ease: 'power3.inOut' });
  };

  useEffect(() => {
    const scroller = scrollerRef?.current;
    if (!scroller) return;
    const onScroll = () => {
      const w = Math.round(scroller.scrollLeft / 196) + 1;
      setActiveWeek(Math.max(1, Math.min(8, w)));
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scrollerRef]);

  useEffect(() => {
    const scroller = scrollerRef?.current;
    if (!scroller) return;
    let isDown = false, startX = 0, startScrollLeft = 0;
    const onDown = (e) => {
      const target = e.target;
      if (target.closest('.task-bar') || target.closest('[data-no-pan]') || target.closest('button') || target.closest('input') || target.closest('a')) return;
      isDown = true;
      startX = e.pageX;
      startScrollLeft = scroller.scrollLeft;
      scroller.style.cursor = 'grabbing';
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!isDown) return;
      scroller.scrollLeft = startScrollLeft - (e.pageX - startX);
    };
    const onUp = () => { isDown = false; scroller.style.cursor = ''; };
    scroller.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      scroller.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scrollerRef]);


  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.querySelectorAll('.gantt-today, .gantt-milestone').forEach(n => n.remove());
    if (project.start_date) {
      const start = new Date(project.start_date);
      const today = new Date();
      const diffDays = Math.round((today - start) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 56) {
        const line = document.createElement('div');
        line.className = 'gantt-today';
        line.style.left = (diffDays * 28) + 'px';
        bodyRef.current.appendChild(line);
      }
      // milestones
      (project.milestones || []).forEach(m => {
        const dDays = Math.round((new Date(m.target_date) - start) / (1000 * 60 * 60 * 24));
        if (dDays < 0 || dDays > 56) return;
        const flag = document.createElement('div');
        flag.className = 'gantt-milestone';
        flag.style.left = (dDays * 28) + 'px';
        flag.style.background = m.color || '#f59e0b';
        flag.dataset.name = m.name;
        flag.dataset.completed = m.completed ? '1' : '0';
        if (m.completed) flag.style.opacity = '0.45';
        bodyRef.current.appendChild(flag);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.start_date, project.phases?.length, project.milestones?.length]);

  useEffect(() => {
    if (reduced || !bodyRef.current) return;
    const bars = bodyRef.current.querySelectorAll('.task-bar');
    if (!bars.length || bars.length > 25) return;
    gsap.fromTo(bars, { scaleX: 0, transformOrigin: '0% 50%', opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.02 });
  }, [project.phases]);

  return (
    <div style={{ width: 1568 }}>
      <div ref={headerRef} className="sticky top-0 z-30">
        <div className="flex bg-gradient-to-r from-ink-950 to-violet-900 text-white relative" style={{ width: 1568 }}>
          {Array.from({ length: 8 }).map((_, s) => {
            const isActive = activeWeek === s + 1;
            return (
              <button
                key={s}
                type="button"
                data-week-header="1"
                onClick={() => scrollToWeek(s)}
                className={`flex-shrink-0 border-r border-white/5 text-[10px] font-bold text-center py-3 tracking-wide transition-all relative outline-none ${isActive ? 'bg-violet-600/40 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                style={{ width: 196 }}
                title={`${t('pj.week')} ${s + 1}`}
              >
                {t('pj.week')} {s + 1}
                {isActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-10 bg-fuchsia-400 rounded-full" />}
              </button>
            );
          })}
        </div>
        <div className="flex bg-white border-b" style={{ width: 1568 }}>
          {Array.from({ length: 56 }).map((_, d) => {
            const isWeekend = (d % 7 === 5 || d % 7 === 6);
            const days = t('pj.daysShort').split(',');
            return <div key={d} className={`flex-shrink-0 h-9 flex items-center justify-center text-[9px] border-r font-semibold ${isWeekend ? 'bg-ink-50 text-ink-400' : 'text-ink-300'}`} style={{ width: 28 }}>{days[d % 7]}</div>;
          })}
        </div>
      </div>
      <div ref={bodyRef} className="relative" style={{ width: 1568 }}>
        {project.phases?.map((ph, pIdx) => (
          <GanttRow key={ph.id} phase={ph} pIdx={pIdx} editable={editable} maxDayIndex={maxDayIndex} onChange={onChange} onEditTask={(tk) => onEditTask && onEditTask(tk, ph.id)} />
        ))}
        {outOfRangeLeft < 1568 && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-20 border-l-2 border-dashed border-red-300/70"
            style={{
              left: outOfRangeLeft,
              width: 1568 - outOfRangeLeft,
              background: 'repeating-linear-gradient(45deg, rgba(244,63,94,0.07) 0 8px, rgba(244,63,94,0.14) 8px 16px)',
            }}
            title={t('pj.outOfRange')}
          />
        )}
      </div>
    </div>
  );
}

function GanttRow({ phase, pIdx, editable, maxDayIndex = 55, onChange, onEditTask }) { // eslint-disable-line no-unused-vars
  const showToast = useToast(s => s.show);
  const { t } = useT();
  const rowRef = useRef(null);
  const rectRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const mountedRef = useRef(false);
  const dragMoved = useRef(false);
  const startDay = phase.start_day || 1;
  const durationDays = phase.duration_days != null ? phase.duration_days : (phase.duration_weeks || 1) * 7;
  const fLeft = (((phase.start_week - 1) * 7) + (startDay - 1)) * 28;
  const fWidth = durationDays * 28;
  const TOTAL_WIDTH = 8 * 7 * 28;
  const DAY_PX = 28;
  const RANGE_PX = (maxDayIndex + 1) * DAY_PX; // límite del plazo del proyecto

  useEffect(() => {
    if (!rectRef.current) return;
    if (!mountedRef.current || reduced) {
      mountedRef.current = true;
      rectRef.current.style.left = fLeft + 'px';
      rectRef.current.style.width = fWidth + 'px';
      return;
    }
    gsap.to(rectRef.current, { left: fLeft, width: fWidth, x: 0, duration: 0.55, ease: 'power3.out' });
  }, [fLeft, fWidth]);

  useEffect(() => {
    if (!editable || !rectRef.current || reduced) return;
    const rect = rectRef.current;

    const moveDrag = Draggable.create(rect, {
      type: 'x',
      bounds: rowRef.current,
      cursor: 'grab',
      activeCursor: 'grabbing',
      edgeResistance: 0.65,
      dragClickables: false,
      onDragStart() { rect.style.zIndex = 5; dragMoved.current = false; },
      onDrag() { dragMoved.current = true; },
      onDragEnd: async () => {
        const dx = moveDrag[0].x;
        const newLeftRaw = Math.max(0, Math.min(RANGE_PX - fWidth, fLeft + dx));
        const newLeftSnap = Math.round(newLeftRaw / DAY_PX) * DAY_PX;
        const dayIndex = Math.min(maxDayIndex, newLeftSnap / DAY_PX);
        const newWeek = Math.min(8, Math.max(1, Math.floor(dayIndex / 7) + 1));
        const newDay = Math.min(7, Math.max(1, (dayIndex % 7) + 1));
        gsap.to(rect, { x: 0, left: dayIndex * DAY_PX, duration: 0.3, ease: 'power3.out' });
        if (newWeek === phase.start_week && newDay === startDay) return;
        try { await updatePhase(phase.id, { start_week: newWeek, start_day: newDay }); await onChange(); }
        catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
      }
    });

    let startW = fWidth;
    const resizeDrag = resizeHandleRef.current ? Draggable.create(resizeHandleRef.current, {
      type: 'x',
      cursor: 'ew-resize',
      onPress(e) { e.stopPropagation(); startW = rect.offsetWidth; },
      onDrag() {
        const newW = Math.max(DAY_PX, Math.min(RANGE_PX - parseFloat(rect.style.left || 0), startW + this.x));
        rect.style.width = newW + 'px';
        gsap.set(resizeHandleRef.current, { x: 0 });
      },
      onDragEnd: async () => {
        const leftIdx = Math.round(parseFloat(rect.style.left || 0) / DAY_PX);
        const maxDays = Math.max(1, maxDayIndex - leftIdx + 1);
        const days = Math.max(1, Math.min(maxDays, Math.round(rect.offsetWidth / DAY_PX)));
        gsap.to(rect, { width: days * DAY_PX, duration: 0.3, ease: 'power3.out' });
        if (days === durationDays) return;
        const weeks = Math.max(1, Math.min(8, Math.ceil(days / 7)));
        try { await updatePhase(phase.id, { duration_days: days, duration_weeks: weeks }); await onChange(); }
        catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
      }
    }) : null;

    return () => {
      moveDrag.forEach(d => d.kill());
      if (resizeDrag) resizeDrag.forEach(d => d.kill());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, phase.id, fLeft, fWidth, startDay, durationDays, maxDayIndex]);

  return (
    <div ref={rowRef} className="flex h-[280px] border-b relative items-start pt-10 gantt-grid" style={{ width: TOTAL_WIDTH }}>
      <div
        ref={rectRef}
        data-no-pan="phase-rect"
        className={`absolute h-[200px] rounded-3xl bg-gradient-to-br from-violet-50/70 to-fuchsia-50/40 border-2 border-dashed border-violet-200 z-0 ${editable ? 'cursor-grab hover:border-violet-400 hover:from-violet-100/80 hover:to-fuchsia-100/50 transition-colors' : ''}`}
        style={{ left: fLeft, width: fWidth, willChange: 'transform' }}
        title={editable ? `${phase.name} · ${t('pj.dragHint')}` : phase.name}
      >
        {editable && (
          <>
            <div className="absolute left-3 top-3 text-[10px] font-black text-violet-700/70 uppercase tracking-widest pointer-events-none select-none">
              {phase.name}
            </div>
            <div
              ref={resizeHandleRef}
              data-no-pan="resize"
              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-violet-500/30 rounded-r-3xl transition-colors flex items-center justify-center group"
              title={t('pj.resizeHint')}
            >
              <div className="w-0.5 h-8 bg-violet-400/60 group-hover:bg-violet-600 rounded-full transition-colors" />
            </div>
          </>
        )}
        {!editable && (
          <div className="absolute left-3 top-3 text-[10px] font-black text-violet-700/70 uppercase tracking-widest pointer-events-none select-none">
            {phase.name}
          </div>
        )}
      </div>
      {phase.tasks?.map((tk, tIdx) => (
        <GanttBar key={tk.id} task={tk} tIdx={tIdx} rowRef={rowRef} editable={editable} maxDayIndex={maxDayIndex} onChange={onChange} onEditTask={onEditTask} />
      ))}
    </div>
  );
}

function GanttBar({ task, tIdx, rowRef, editable, maxDayIndex = 55, onChange, onEditTask }) {
  const showToast = useToast(s => s.show);
  const barRef = useRef(null);
  const handleRef = useRef(null);
  const dragMoved = useRef(false);

  const left = (((task.start_week - 1) * 7) + (task.start_day - 1)) * 28;
  const width = task.duration * 28;
  const top = 50 + (tIdx * 44);
  const RANGE_PX = (maxDayIndex + 1) * 28;

  // Tras un refresh de datos, React reaplica `left`/`width` por estilo inline
  // pero GSAP deja un transform `x` residual del arrastre => doble offset.
  // Resetear `x` aquí mantiene la barra exactamente donde la dejó el drag.
  useEffect(() => {
    if (barRef.current) gsap.set(barRef.current, { x: 0 });
  }, [left, width]);

  useEffect(() => {
    if (!editable || !barRef.current || reduced) return;
    const bar = barRef.current;
    const handle = handleRef.current;

    const moveDrag = Draggable.create(bar, {
      type: 'x', bounds: rowRef.current, inertia: false,
      cursor: 'grabbing', edgeResistance: 0.7,
      dragClickables: false,
      onDragStart() { bar.style.zIndex = 60; dragMoved.current = false; },
      onDrag() { dragMoved.current = true; },
      onDragEnd: async () => {
        const dx = moveDrag[0].x;
        const newLeftPx = Math.max(0, Math.min(RANGE_PX - width, Math.round((left + dx) / 28) * 28));
        const dayIndex = newLeftPx / 28;
        const newWeek = Math.min(8, Math.max(1, Math.floor(dayIndex / 7) + 1));
        const newDay = Math.min(7, Math.max(1, (dayIndex % 7) + 1));
        // Snap instantáneo; el refresh posterior reaplica `left` y el efecto resetea `x`.
        gsap.set(bar, { x: newLeftPx - left });
        if (newWeek === task.start_week && newDay === task.start_day) {
          gsap.to(bar, { x: 0, duration: 0.2, ease: 'power3.out' });
          return;
        }
        try { await updateTask(task.id, { start_week: newWeek, start_day: newDay }); await onChange(); }
        catch (e) { showToast('Error: ' + e.message, 'error'); }
      }
    });

    let startW = width;
    const resizeDrag = handle ? Draggable.create(handle, {
      type: 'x', cursor: 'ew-resize',
      onPress(e) { e.stopPropagation(); startW = bar.offsetWidth; },
      onDrag() { const newW = Math.max(28, Math.min(RANGE_PX - left, startW + this.x)); bar.style.width = newW + 'px'; gsap.set(handle, { x: 0 }); },
      onDragEnd: async () => {
        const maxDays = Math.max(1, maxDayIndex - (left / 28) + 1);
        const days = Math.max(1, Math.min(maxDays, Math.round(bar.offsetWidth / 28)));
        bar.style.width = (days * 28) + 'px';
        if (days === task.duration) return;
        try { await updateTask(task.id, { duration: days }); await onChange(); }
        catch (e) { showToast('Error: ' + e.message, 'error'); }
      }
    }) : null;

    return () => {
      if (moveDrag[0]) moveDrag[0].kill();
      if (resizeDrag && resizeDrag[0]) resizeDrag[0].kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, left, width, editable, onChange, rowRef, maxDayIndex]);

  const handleClick = (e) => {
    if (dragMoved.current) { dragMoved.current = false; return; }
    if (e.target.classList.contains('resize-handle')) return;
    if (onEditTask) onEditTask(task);
  };

  return (
    <div ref={barRef} onClick={handleClick}
      className={`task-bar absolute h-9 rounded-xl shadow-lg flex items-center px-3 overflow-visible border border-white/40 z-10 text-white ${editable ? 'cursor-grab' : (onEditTask ? 'cursor-pointer' : 'cursor-default')}`}
      style={{ left, width, top, background: task.completed ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
      <span className="text-[10px] font-bold truncate flex-1">{task.name}</span>
      {editable && <div ref={handleRef} className="resize-handle"></div>}
    </div>
  );
}
