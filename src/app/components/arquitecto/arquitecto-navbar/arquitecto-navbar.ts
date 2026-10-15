import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-arquitecto-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './arquitecto-navbar.html',
  styleUrl: './arquitecto-navbar.css'
})
export class ArquitectoNavbarComponent implements OnInit {
  usuario: any = null;

  constructor(
    private readonly router: Router,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      this.usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
    } catch {
      this.usuario = null;
    }
  }

  cerrarSesion(): void {
    if (isPlatformBrowser(this.platformId)) localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }
}
