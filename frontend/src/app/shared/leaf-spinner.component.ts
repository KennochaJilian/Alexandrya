import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-leaf-spinner',
  templateUrl: './leaf-spinner.component.html',
  styleUrl: './leaf-spinner.component.scss'
})
export class LeafSpinnerComponent {
  @Input() label = 'Chargement';
  @Input() compact = false;
}
