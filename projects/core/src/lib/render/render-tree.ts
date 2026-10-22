import {
  RendererFactory2,
  createComponent,
  createEnvironmentInjector,
  type EnvironmentInjector,
  type Type,
} from '@angular/core';
import { PdfRendererFactory } from '../tree/pdf-renderer-factory';
import type { PdfNode } from '../tree/node';

/**
 * Renders a component into a PdfNode tree. The component gets its own child injector so each
 * render has its own renderer and tree; the caller's injector is only the parent.
 */
export function renderTree<T>(
  component: Type<T>,
  parent: EnvironmentInjector,
  inputs: Record<string, unknown> = {},
): { root: PdfNode; destroy(): void } {
  const environmentInjector = createEnvironmentInjector(
    [{ provide: RendererFactory2, useFactory: () => new PdfRendererFactory() }],
    parent,
  );
  const ref = createComponent(component, { environmentInjector });
  const destroy = (): void => {
    ref.destroy();
    environmentInjector.destroy();
  };
  try {
    for (const [name, value] of Object.entries(inputs)) ref.setInput(name, value);
    ref.changeDetectorRef.detectChanges();
  } catch (error) {
    destroy();
    throw error;
  }
  return { root: ref.location.nativeElement as PdfNode, destroy };
}
