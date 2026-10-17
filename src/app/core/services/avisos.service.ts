import { Injectable, signal } from '@angular/core';

export type TipoAviso = 'exito' | 'error' | 'info';

export interface Aviso {
  id: number;
  texto: string;
  tipo: TipoAviso;
}

export interface Confirmacion {
  titulo: string;
  mensaje: string;
  textoAceptar: string;
  peligro: boolean;
  responder: (aceptado: boolean) => void;
}

/**
 * Avisos flotantes y cuadro de confirmación de SIGOA.
 * Reemplaza los alert() y confirm() del navegador con componentes
 * del diseño. Los dibuja el App Shell, así que funcionan en todas las pantallas.
 *
 * Uso:
 *   this.avisos.exito('Proyecto guardado');
 *   if (await this.avisos.confirmar({ titulo: 'Eliminar', mensaje: '¿Seguro?' })) { ... }
 */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  readonly lista = signal<Aviso[]>([]);
  readonly confirmacion = signal<Confirmacion | null>(null);
  private siguienteId = 1;

  mostrar(texto: string, tipo: TipoAviso = 'info'): void {
    const id = this.siguienteId++;
    this.lista.update((avisos) => [...avisos, { id, texto, tipo }]);
    setTimeout(() => this.cerrar(id), 4500);
  }

  exito(texto: string): void {
    this.mostrar(texto, 'exito');
  }

  error(texto: string): void {
    this.mostrar(texto, 'error');
  }

  cerrar(id: number): void {
    this.lista.update((avisos) => avisos.filter((a) => a.id !== id));
  }

  /** Abre el cuadro de confirmación y espera la respuesta (true = aceptar) */
  confirmar(opciones: { titulo: string; mensaje: string; textoAceptar?: string; peligro?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmacion.set({
        titulo: opciones.titulo,
        mensaje: opciones.mensaje,
        textoAceptar: opciones.textoAceptar ?? 'Aceptar',
        peligro: opciones.peligro ?? false,
        responder: (aceptado) => {
          this.confirmacion.set(null);
          resolve(aceptado);
        }
      });
    });
  }
}
