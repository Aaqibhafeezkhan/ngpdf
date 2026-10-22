// Made-up data for the demo documents. Everything here is generated, nothing is real.

export interface Communicator {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly registeredAt: Date;
}

export interface Licence {
  readonly id: number;
  readonly product: string;
  readonly customer: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly invoice: string;
  readonly amount: number;
}

const FIRST_NAMES = [
  'Ana',
  'Bruno',
  'Carla',
  'Diego',
  'Elaine',
  'Fábio',
  'Gabriela',
  'Heitor',
  'Isabela',
  'João',
  'Kátia',
  'Lucas',
  'Mariana',
  'Nelson',
  'Olívia',
  'Paulo',
];

const LAST_NAMES = [
  'Almeida',
  'Barbosa',
  'Cardoso',
  'Domingues',
  'Esteves',
  'Ferreira',
  'Gonçalves',
  'Henriques',
  'Ibrahim',
  'Junqueira',
  'Lacerda',
  'Monteiro',
  'Nascimento',
  'Oliveira',
  'Pacheco',
];

const PRODUCTS = [
  'Painel de Indicadores',
  'Gestão de Contratos',
  'Emissor de Notas',
  'Controle de Estoque',
  'Portal do Cliente',
  'Agenda Integrada',
];

const CUSTOMERS = [
  'Padaria Trigo Dourado Ltda',
  'Oficina Mecânica Rio Claro',
  'Clínica Vida e Saúde',
  'Mercearia Vila Nova',
  'Escritório Contábil Horizonte',
  'Transportadora Serra Azul',
  'Clínica Bem Viver',
  'Construtora Pedra Forte',
  'Hotel Vista Alegre',
  'Distribuidora Sol Nascente',
];

/** A deterministic pick, so every run produces the same documents. */
function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length] as T;
}

export function makeCommunicators(count: number): Communicator[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const first = pick(FIRST_NAMES, id * 7);
    const last = pick(LAST_NAMES, id * 3);
    // Every fifth name gets a second surname, so some cells wrap.
    const name =
      id % 5 === 0
        ? `${first} ${last} de ${pick(LAST_NAMES, id * 11 + 2)} Filho`
        : `${first} ${last}`;
    return {
      id,
      name,
      email: `pessoa${String(id)}@example.com`,
      phone: `9${String(1000 + ((id * 137) % 9000))}-${String(1000 + ((id * 271) % 9000))}`,
      registeredAt: new Date(2024, id % 12, 1 + (id % 28)),
    };
  });
}

export function makeLicences(count: number): Licence[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const startsAt = new Date(2025, id % 12, 1 + ((id * 3) % 28));
    return {
      id,
      product: pick(PRODUCTS, id * 5),
      customer: pick(CUSTOMERS, id * 3 + 1),
      startsAt,
      endsAt: new Date(startsAt.getFullYear() + 1, startsAt.getMonth(), startsAt.getDate()),
      invoice: `NF-${String(2026000 + id * 13)}`,
      amount: 490 + ((id * 377) % 9000) + (id % 100) / 100,
    };
  });
}

export const CHART_BARS: readonly { readonly label: string; readonly value: number }[] = [
  { label: 'Jan', value: 42 },
  { label: 'Fev', value: 58 },
  { label: 'Mar', value: 51 },
  { label: 'Abr', value: 73 },
  { label: 'Mai', value: 66 },
  { label: 'Jun', value: 88 },
];
