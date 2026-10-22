import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), { provide: LOCALE_ID, useValue: 'pt-BR' }],
};
