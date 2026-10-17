import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  isDevMode
} from '@angular/core';

import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

import { provideClientHydration } from '@angular/platform-browser';

import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {

  providers: [

    provideBrowserGlobalErrorListeners(),

    // Al cambiar de pantalla, la nueva empieza desde arriba
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
   
    provideHttpClient(),

    provideClientHydration(),

    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),

  ],

};