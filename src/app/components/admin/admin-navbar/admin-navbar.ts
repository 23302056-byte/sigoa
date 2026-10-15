import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Router,
  RouterLink,
  RouterLinkActive
} from '@angular/router';

@Component({
  selector: 'app-admin-navbar',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './admin-navbar.html',
  styleUrl: './admin-navbar.css'
})
export class AdminNavbarComponent {

  usuario: any = null;

  constructor(
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {

    if (isPlatformBrowser(this.platformId)) {

      const usuarioGuardado = localStorage.getItem('usuario');

      if (usuarioGuardado) {
        this.usuario = JSON.parse(usuarioGuardado);
      }

    }

  }

  cerrarSesion(): void {

    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('usuario');
    }

    this.router.navigate(['/login']);

  }

}