import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Usuario {
  id_usuario: number;
  id_rol: number;
  nombre: string;
  apellidos: string;
  correo: string;
  telefono: string;
  activo: boolean;
  rol: string;
}

export interface RespuestaLogin {
  success: boolean;
  mensaje: string;
  usuario?: Usuario;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'http://localhost:3000/api/routes/auth';

  constructor(private http: HttpClient) {}

  login(
    correo: string,
    password: string
  ): Observable<RespuestaLogin> {

    return this.http.post<RespuestaLogin>(
      `${this.apiUrl}/login`,
      {
        correo,
        password
      }
    );
  }
}