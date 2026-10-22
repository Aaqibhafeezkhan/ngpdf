import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';
import type { Communicator } from '../data';

@Component({
  selector: 'app-communicators-list',
  imports: [PDF_ELEMENTS, DatePipe],
  template: `
    <pdf-document title="Lista de comunicadores" author="ngpdf demo">
      <pdf-page style="padding: 36; font-size: 9">
        <pdf-text style="font-size: 16; font-weight: bold; margin-bottom: 10">
          Lista de comunicadores
        </pdf-text>
        <pdf-table [columns]="[30, '2fr', '3fr', '1fr', '1fr']">
          <pdf-row
            header
            style="padding-top: 5; padding-bottom: 5; background-color: #dd0031; color: #ffffff; font-weight: bold"
          >
            <pdf-cell style="padding-left: 4; padding-right: 4"><pdf-text>#</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4; padding-right: 4"><pdf-text>Nome</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4; padding-right: 4"
              ><pdf-text>E-mail</pdf-text></pdf-cell
            >
            <pdf-cell style="padding-left: 4; padding-right: 4"
              ><pdf-text>Telefone</pdf-text></pdf-cell
            >
            <pdf-cell style="padding-left: 4; padding-right: 4"
              ><pdf-text>Cadastro</pdf-text></pdf-cell
            >
          </pdf-row>
          @for (item of items(); track item.id) {
            <pdf-row
              style="padding-top: 4; padding-bottom: 4"
              [style.background-color]="$odd ? '#f2f2f2' : '#ffffff'"
            >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.id }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.name }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.email }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.phone }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.registeredAt | date: 'dd/MM/yyyy' }}</pdf-text></pdf-cell
              >
            </pdf-row>
          }
        </pdf-table>
        <pdf-page-number
          format="Página {page} de {total}"
          style="text-align: right; font-size: 8"
        />
      </pdf-page>
    </pdf-document>
  `,
})
export class CommunicatorsList {
  readonly items = input.required<Communicator[]>();
}
