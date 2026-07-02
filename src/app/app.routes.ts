import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Upload — PerfLens',
    loadComponent: () =>
      import('./features/upload/upload.component').then(m => m.UploadComponent),
  },
  {
    path: 'dashboard',
    title: 'Dashboard — PerfLens',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
