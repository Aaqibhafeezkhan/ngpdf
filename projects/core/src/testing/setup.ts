import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

// Zoneless TestBed for component specs. Node-environment specs never touch it.
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
