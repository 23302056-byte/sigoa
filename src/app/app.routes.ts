import { Routes } from '@angular/router';
import { adminAuthGuard } from './guards/admin-auth.guard';
import { architectAuthGuard } from './guards/architect-auth.guard';

export const routes: Routes = [

  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },

  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login')
        .then(m => m.Login)
  },

  {
    path: 'admin',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./pages/admin/inicio/inicio')
        .then(m => m.InicioComponent)
  },
  {
    path: 'arquitecto',
    canActivate: [architectAuthGuard],
    loadComponent: () =>
      import('./pages/arquitecto/inicio/inicio')
        .then(m => m.InicioArquitecto)
  },
  {
    path: 'arquitecto/proyectos',
    canActivate: [architectAuthGuard],
    loadComponent: () =>
      import('./pages/arquitecto/proyectos/proyectos')
        .then(m => m.ProyectosArquitecto)
  },
  {
    path: 'arquitecto/obras',
    canActivate: [architectAuthGuard],
    loadComponent: () =>
      import('./pages/arquitecto/obras/obras')
        .then(m => m.ObrasArquitecto)
  },
  {
    path: 'admin/proyectos',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./pages/admin/proyectos/proyectos')
        .then(m => m.Proyectos)
  },
  {
    path: 'admin/obras',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./pages/obras/obras')
        .then(m => m.Obras)
  },
  {
    path: 'admin/cotizaciones',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./pages/admin/cotizaciones/cotizaciones')
        .then(m => m.Cotizaciones)
  },
  {
    path: 'admin/contratos',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./pages/admin/contratos/contratos')
        .then(m => m.Contratos)
  },
  {
    path: 'admin/pagos',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./pages/admin/pagos/pagos')
        .then(m => m.Pagos)
  },
  {
    path: 'admin/usuarios',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./pages/admin/usuarios/usuarios')
        .then(m => m.Usuarios)
  }

];
