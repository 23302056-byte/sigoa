import { afterNextRender, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

interface Pago { id: number; id_proyecto: number; proyecto: string; cliente: string; fecha: string; concepto: string; monto: number; metodo_pago: string; referencia: string; estado: string; observaciones: string; }
interface Proyecto { id: number; nombre: string; }
interface Respuesta { success: boolean; mensaje?: string; pagos?: Pago[]; proyectos?: Proyecto[]; }

@Component({ selector: 'app-pagos', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './pagos.html', styleUrl: './pagos.css' })
export class Pagos implements OnDestroy {
  private readonly api = 'http://localhost:3000/api/routes/pagos';
  private db: IDBDatabase | null = null;
  pagos: Pago[] = []; pagosFiltrados: Pago[] = []; proyectos: Proyecto[] = [];
  readonly metodos = ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'];
  readonly estados = ['Pendiente', 'Pagado', 'Cancelado'];
  cargando = true; error = ''; conectado = false; busqueda = ''; modal = false; editando = false; guardando = false;
  idProyectoFiltro = 0; proyectoFiltro = '';
  seleccionado: Pago = this.vacio();

  constructor(private http: HttpClient, private change: ChangeDetectorRef, private route: ActivatedRoute, private router: Router) {
    this.idProyectoFiltro = Number(this.route.snapshot.queryParamMap.get('id_proyecto')) || 0;
    this.proyectoFiltro = this.route.snapshot.queryParamMap.get('proyecto') || '';
    afterNextRender(() => this.iniciar());
  }

  get proyectosDisponibles(): Proyecto[] { return this.idProyectoFiltro ? this.proyectos.filter(p => p.id === this.idProyectoFiltro) : this.proyectos; }
  volverAProyecto(): void { this.router.navigate(['/admin/proyectos']); }

  private iniciar(): void {
    this.conectado = navigator.onLine;
    window.addEventListener('online', this.online); window.addEventListener('offline', this.offline);
    const req = indexedDB.open('SIGOA_PAGOS_CACHE', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('pagos')) req.result.createObjectStore('pagos'); };
    req.onsuccess = () => { this.db = req.result; this.cargar(); if (navigator.onLine) this.cargarProyectos(); };
    req.onerror = () => { this.error = 'No se pudo abrir el almacenamiento local.'; this.cargando = false; this.change.detectChanges(); };
  }
  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.online);
      window.removeEventListener('offline', this.offline);
    }
    this.db?.close();
  }
  private online = (): void => { this.conectado = true; this.cargar(); this.cargarProyectos(); this.change.detectChanges(); };
  private offline = (): void => { this.conectado = false; this.cargarCache(); this.change.detectChanges(); };
  private cargarCache(): void {
    if (!this.db) { this.cargando = false; this.error = 'No hay almacenamiento local disponible.'; return; }
    const req = this.db.transaction('pagos', 'readonly').objectStore('pagos').get('lista');
    req.onsuccess = () => { this.pagos = Array.isArray(req.result) ? req.result : []; this.filtrar(); this.error = this.pagos.length ? '' : 'No hay pagos guardados sin conexión.'; this.cargando = false; this.change.detectChanges(); };
    req.onerror = () => { this.error = 'No se pudieron leer los pagos guardados.'; this.cargando = false; this.change.detectChanges(); };
  }
  cargar(): void {
    this.cargando = true; this.error = '';
    this.http.get<Respuesta>(this.api).subscribe({
      next: r => { if (r.success) { this.pagos = (r.pagos || []).map(p => ({ ...p, id: Number(p.id), monto: Number(p.monto), fecha: String(p.fecha || '').substring(0, 10) })); this.filtrar(); this.db?.transaction('pagos', 'readwrite').objectStore('pagos').put(this.pagos, 'lista'); } else this.error = r.mensaje || 'No se pudieron cargar los pagos.'; this.cargando = false; this.change.detectChanges(); },
      error: e => { this.conectado = false; this.cargarCache(); if (!this.error) this.error = e.error?.mensaje || ''; }
    });
  }
  private cargarProyectos(): void { this.http.get<Respuesta>(`${this.api}/opciones`).subscribe({ next: r => this.proyectos = r.proyectos || [], error: () => {} }); }
  filtrar(): void { const q = this.busqueda.trim().toLowerCase(); this.pagosFiltrados = this.pagos.filter(p => (!this.idProyectoFiltro || p.id_proyecto === this.idProyectoFiltro) && (!q || [p.proyecto, p.cliente, p.concepto, p.referencia, p.estado].some(x => (x || '').toLowerCase().includes(q)))); }
  nuevo(): void { if (!this.conectado) { alert('Conéctate a internet para registrar pagos.'); return; } this.seleccionado = this.vacio(); this.seleccionado.id_proyecto = this.idProyectoFiltro; this.editando = true; this.modal = true; }
  ver(p: Pago): void { this.seleccionado = { ...p }; this.editando = false; this.modal = true; }
  editar(p: Pago): void { if (!this.conectado) { alert('No tienes conexión. No puedes modificar pagos sin conexión.'); return; } this.seleccionado = { ...p }; this.editando = true; this.modal = true; }
  guardar(): void {
    const p = this.seleccionado;
    if (!this.conectado) { alert('Conéctate a internet para guardar el pago.'); return; }
    if (!p.id_proyecto || !p.fecha || !p.concepto.trim() || p.monto < 0) { alert('Completa proyecto, fecha, concepto y monto.'); return; }
    this.guardando = true;
    const req = p.id ? this.http.put<Respuesta>(`${this.api}/${p.id}`, p) : this.http.post<Respuesta>(this.api, p);
    req.subscribe({ next: r => { this.guardando = false; if (!r.success) { alert(r.mensaje || 'No se guardó el pago.'); return; } this.modal = false; this.cargar(); }, error: e => { this.guardando = false; alert(e.error?.mensaje || 'No se guardó el pago.'); this.change.detectChanges(); } });
  }
  eliminar(p: Pago): void { if (!this.conectado) { alert('No tienes conexión. No puedes eliminar pagos sin conexión.'); return; } if (!confirm(`¿Eliminar el pago "${p.concepto}"?`)) return; this.http.delete<Respuesta>(`${this.api}/${p.id}`).subscribe({ next: r => r.success ? this.cargar() : alert(r.mensaje || 'No se eliminó.'), error: e => alert(e.error?.mensaje || 'No se eliminó el pago.') }); }
  cerrar(): void { this.modal = false; this.seleccionado = this.vacio(); }
  moneda(n: number): string { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0); }
  private vacio(): Pago { return { id: 0, id_proyecto: 0, proyecto: '', cliente: '', fecha: new Date().toISOString().substring(0, 10), concepto: '', monto: 0, metodo_pago: 'Transferencia', referencia: '', estado: 'Pendiente', observaciones: '' }; }
}
