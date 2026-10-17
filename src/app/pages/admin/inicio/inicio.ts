import {
  Component,
  OnInit,
  OnDestroy,
  signal
} from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';


interface ResumenRespuesta {
  success?: boolean;

  proyectos?: {
    total?: number;
    enProgreso?: number;
  };

  obras?: {
    total?: number;
    enConstruccion?: number;
  };

  cotizaciones?: {
    total?: number;
    pendientes?: number;
  };

  contratos?: {
    total?: number;
    activos?: number;
  };

  pagos?: {
    pendientes?: number;
    montoPendiente?: number;
  };

  avancePromedio?: number;
}

@Component({
  selector: 'app-inicio',
  standalone: true,

  imports: [
    
    RouterLink
  ],

  templateUrl: './inicio.html',
  styleUrl: './inicio.css'
})
export class InicioComponent implements OnInit, OnDestroy {

  // =========================================
  // ESTADOS
  // =========================================

  cargando = signal(true);

  error = '';

  conectado = false;


  // =========================================
  // INFORMACIÓN
  // =========================================

  proyectos = {
    total: 0,
    enProgreso: 0
  };

  obras = {
    total: 0,
    enConstruccion: 0
  };

  cotizaciones = {
    total: 0,
    pendientes: 0
  };

  contratos = {
    total: 0,
    activos: 0
  };

  pagos = {
    pendientes: 0,
    montoPendiente: 0
  };

  avancePromedio = 0;


  // =========================================
  // INDEXED DB
  // =========================================

  private db: IDBDatabase | null = null;

  private readonly nombreDB = 'SIGOA_DB';

  private readonly versionDB = 1;

  private readonly nombreStore = 'resumen';


  // =========================================
  // CONSTRUCTOR
  // =========================================

  constructor(
    private http: HttpClient
  ) {}


  // =========================================
  // INICIO
  // =========================================

  ngOnInit(): void {

    console.log('================================');
    console.log('INICIANDO INICIO');
    console.log('================================');


    // =========================================
    // COMPROBAR NAVEGADOR
    // =========================================

    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined'
    ) {

      console.log(
        'No estamos en navegador'
      );

      this.cargando.set(false);

      return;
    }


    console.log(
      'Estamos en navegador'
    );


    // =========================================
    // COMPROBAR INTERNET
    // =========================================

    this.conectado = navigator.onLine;

    console.log(
      'Internet:',
      this.conectado
        ? 'CONECTADO'
        : 'SIN CONEXIÓN'
    );


    // =========================================
    // ESCUCHAR CAMBIOS DE INTERNET
    // =========================================

    window.addEventListener(
      'online',
      this.cuandoHayInternet
    );

    window.addEventListener(
      'offline',
      this.cuandoNoHayInternet
    );


    // =========================================
    // ABRIR INDEXED DB
    // =========================================

    this.abrirIndexedDB()

      .then(() => {

        console.log(
          'IndexedDB lista'
        );


        if (navigator.onLine) {

          console.log(
            'Hay internet → consultando API'
          );

          this.obtenerResumen();

        } else {

          console.log(
            'Sin internet → cargando información local'
          );

          this.cargarResumenGuardado();
        }

      })

      .catch((error) => {

        console.error(
          'Error abriendo IndexedDB:',
          error
        );


        // =========================================
        // SI INDEXEDDB FALLA PERO HAY INTERNET
        // =========================================

        if (navigator.onLine) {

          console.log(
            'IndexedDB falló, pero hay internet'
          );

          this.obtenerResumen();

        } else {

          console.log(
            'No hay internet ni IndexedDB'
          );

          this.error =
            'No hay conexión y no se pudieron cargar los datos locales.';

          this.cargando.set(false);
        }

      });
  }


  // =========================================
  // DESTRUCCIÓN
  // =========================================

  ngOnDestroy(): void {

    if (
      typeof window !== 'undefined'
    ) {

      window.removeEventListener(
        'online',
        this.cuandoHayInternet
      );

      window.removeEventListener(
        'offline',
        this.cuandoNoHayInternet
      );
    }


    if (this.db) {

      this.db.close();

      this.db = null;
    }
  }


  // =========================================
  // INTERNET RECUPERADO
  // =========================================

  private cuandoHayInternet = (): void => {

    console.log('================================');

    console.log(
      'INTERNET RECUPERADO'
    );

    console.log('================================');


    this.conectado = true;

    this.error = '';


    // Volver a consultar información
    this.obtenerResumen();
  };


  // =========================================
  // INTERNET PERDIDO
  // =========================================

  private cuandoNoHayInternet = (): void => {

    console.log('================================');

    console.log(
      'SIN INTERNET'
    );

    console.log('================================');


    this.conectado = false;


    // Cargar último resumen guardado
    this.cargarResumenGuardado();
  };


  // =========================================
  // ABRIR INDEXED DB
  // =========================================

  private abrirIndexedDB(): Promise<void> {

    return new Promise((resolve, reject) => {

      // =========================================
      // COMPROBAR INDEXED DB
      // =========================================

      if (
        typeof window === 'undefined' ||
        !window.indexedDB
      ) {

        reject(
          new Error(
            'IndexedDB no está disponible'
          )
        );

        return;
      }


      console.log(
        'Abriendo IndexedDB...'
      );


      // =========================================
      // ABRIR BASE DE DATOS
      // =========================================

      const request =
        window.indexedDB.open(
          this.nombreDB,
          this.versionDB
        );


      // =========================================
      // CREAR ESTRUCTURA
      // =========================================

      request.onupgradeneeded = () => {

        console.log(
          'Creando estructura de IndexedDB...'
        );


        const db = request.result;


        if (
          !db.objectStoreNames.contains(
            this.nombreStore
          )
        ) {

          db.createObjectStore(
            this.nombreStore
          );


          console.log(
            'Store resumen creado'
          );
        }
      };


      // =========================================
      // INDEXED DB ABIERTA
      // =========================================

      request.onsuccess = () => {

        this.db = request.result;


        console.log(
          'IndexedDB abierta correctamente'
        );


        resolve();
      };


      // =========================================
      // ERROR
      // =========================================

      request.onerror = () => {

        console.error(
          'Error de IndexedDB:',
          request.error
        );


        reject(
          request.error
        );
      };


      // =========================================
      // BLOQUEADA
      // =========================================

      request.onblocked = () => {

        console.error(
          'IndexedDB está bloqueada'
        );


        reject(
          new Error(
            'IndexedDB está bloqueada'
          )
        );
      };
    });
  }


  // =========================================
  // CONSULTAR BACKEND
  // =========================================

  private obtenerResumen(): void {

    console.log('================================');

    console.log(
      'CONSULTANDO BACKEND'
    );

    console.log('================================');


    this.cargando.set(true);

    this.error = '';


    this.http
      .get<ResumenRespuesta>(
        'http://localhost:3000/api/routes/admin/resumen'
      )

      .subscribe({

        // =====================================
        // RESPUESTA CORRECTA
        // =====================================

        next: (datos) => {

          console.log('================================');

          console.log(
            'RESPUESTA DEL BACKEND'
          );

          console.log('================================');


          console.log(
            datos
          );


          // Aplicar datos
          this.aplicarResumen(
            datos
          );


          // =====================================
          // GUARDAR PARA MODO OFFLINE
          // =====================================

          this.guardarResumen(
            datos
          );


          // =====================================
          // TERMINAR CARGA
          // =====================================

          this.error = '';

          this.cargando.set(false);


          console.log(
            'Información cargada correctamente'
          );
        },


        // =====================================
        // ERROR DEL BACKEND
        // =====================================

        error: (error) => {

          console.error(
            'Error consultando backend:',
            error
          );


          console.log(
            'Intentando cargar datos de IndexedDB...'
          );


          // =====================================
          // FALLBACK OFFLINE
          // =====================================

          this.cargarResumenGuardado();
        }

      });
  }


  // =========================================
  // APLICAR DATOS
  // =========================================

  private aplicarResumen(
    datos: ResumenRespuesta
  ): void {

    // =========================================
    // PROYECTOS
    // =========================================

    this.proyectos = {

      total: Number(
        datos.proyectos?.total ?? 0
      ),

      enProgreso: Number(
        datos.proyectos?.enProgreso ?? 0
      )
    };


    // =========================================
    // OBRAS
    // =========================================

    this.obras = {

      total: Number(
        datos.obras?.total ?? 0
      ),

      enConstruccion: Number(
        datos.obras?.enConstruccion ?? 0
      )
    };


    // =========================================
    // COTIZACIONES
    // =========================================

    this.cotizaciones = {

      total: Number(
        datos.cotizaciones?.total ?? 0
      ),

      pendientes: Number(
        datos.cotizaciones?.pendientes ?? 0
      )
    };


    // =========================================
    // CONTRATOS
    // =========================================

    this.contratos = {

      total: Number(
        datos.contratos?.total ?? 0
      ),

      activos: Number(
        datos.contratos?.activos ?? 0
      )
    };


    // =========================================
    // PAGOS
    // =========================================

    this.pagos = {

      pendientes: Number(
        datos.pagos?.pendientes ?? 0
      ),

      montoPendiente: Number(
        datos.pagos?.montoPendiente ?? 0
      )
    };


    // =========================================
    // AVANCE PROMEDIO
    // =========================================

    this.avancePromedio =
      Number(
        datos.avancePromedio ?? 0
      );


    // =========================================
    // CONSOLA
    // =========================================

    console.log('================================');

    console.log(
      'RESUMEN'
    );

    console.log('================================');


    console.log(
      'Proyectos:',
      this.proyectos
    );

    console.log(
      'Obras:',
      this.obras
    );

    console.log(
      'Cotizaciones:',
      this.cotizaciones
    );

    console.log(
      'Contratos:',
      this.contratos
    );

    console.log(
      'Pagos:',
      this.pagos
    );

    console.log(
      'Avance:',
      this.avancePromedio
    );
  }


  // =========================================
  // GUARDAR RESUMEN
  // =========================================

  private guardarResumen(
    datos: ResumenRespuesta
  ): void {

    if (!this.db) {

      console.log(
        'No existe conexión con IndexedDB'
      );

      return;
    }


    console.log(
      'Guardando resumen en IndexedDB...'
    );


    try {

      const transaction =
        this.db.transaction(
          this.nombreStore,
          'readwrite'
        );


      const store =
        transaction.objectStore(
          this.nombreStore
        );


      store.put(
        datos,
        'resumen'
      );


      // =========================================
      // GUARDADO CORRECTO
      // =========================================

      transaction.oncomplete = () => {

        console.log('================================');

        console.log(
          '✓ RESUMEN GUARDADO EN INDEXEDDB'
        );

        console.log('================================');
      };


      // =========================================
      // ERROR
      // =========================================

      transaction.onerror = () => {

        console.error(
          'Error guardando:',
          transaction.error
        );
      };


    } catch (error) {

      console.error(
        'Error usando IndexedDB:',
        error
      );
    }
  }


  // =========================================
  // CARGAR RESUMEN LOCAL
  // =========================================

  private cargarResumenGuardado(): void {

    console.log('================================');

    console.log(
      'BUSCANDO DATOS EN INDEXEDDB'
    );

    console.log('================================');


    // =========================================
    // INICIAR CARGA
    // =========================================

    this.cargando.set(true);

    this.error = '';


    // =========================================
    // COMPROBAR DB
    // =========================================

    if (!this.db) {

      console.error(
        'IndexedDB no está disponible'
      );


      this.error =
        'No se pudo acceder a los datos guardados.';

      this.cargando.set(false);


      return;
    }


    try {

      // =======================================
      // TRANSACCIÓN
      // =======================================

      const transaction =
        this.db.transaction(
          this.nombreStore,
          'readonly'
        );


      const store =
        transaction.objectStore(
          this.nombreStore
        );


      // =======================================
      // OBTENER DATOS
      // =======================================

      const request =
        store.get(
          'resumen'
        );


      // =======================================
      // RESPUESTA
      // =======================================

      request.onsuccess = () => {

        const datos =
          request.result as
          ResumenRespuesta |
          undefined;


        console.log(
          'Datos encontrados:',
          datos
        );


        // =====================================
        // HAY DATOS
        // =====================================

        if (datos) {

          console.log(
            '✓ DATOS OFFLINE ENCONTRADOS'
          );


          this.aplicarResumen(
            datos
          );


          this.error = '';


        }

        // =====================================
        // NO HAY DATOS
        // =====================================

        else {

          console.log(
            'No existen datos guardados'
          );


          this.error =
            'No existen datos guardados para trabajar sin conexión.';
        }


        // =====================================
        // TERMINAR CARGA
        // =====================================

        this.cargando.set(false);


        console.log(
          'Carga offline terminada'
        );
      };


      // =======================================
      // ERROR LEYENDO
      // =======================================

      request.onerror = () => {

        console.error(
          'Error leyendo IndexedDB:',
          request.error
        );


        this.error =
          'No se pudieron leer los datos guardados.';

        this.cargando.set(false);
      };


      // =======================================
      // ERROR TRANSACCIÓN
      // =======================================

      transaction.onerror = () => {

        console.error(
          'Error en transacción IndexedDB:',
          transaction.error
        );


        this.error =
          'Ocurrió un error al leer los datos locales.';

        this.cargando.set(false);
      };


    } catch (error) {

      console.error(
        'Error leyendo datos locales:',
        error
      );


      this.error =
        'No se pudieron cargar los datos locales.';

      this.cargando.set(false);
    }
  }


  // =========================================
  // FORMATO DINERO
  // =========================================

  formatoDinero(
    cantidad: number
  ): string {

    return new Intl.NumberFormat(
      'es-MX',
      {
        style: 'currency',
        currency: 'MXN'
      }
    ).format(
      cantidad
    );
  }


  // =========================================
  // FORMATO PORCENTAJE
  // =========================================

  formatoPorcentaje(
    porcentaje: number
  ): string {

    return `${porcentaje.toFixed(1)}%`;
  }

}