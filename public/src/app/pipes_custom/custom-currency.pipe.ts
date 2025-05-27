import { Pipe, PipeTransform } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

@Pipe({
  name: 'customCurrency',
  // standalone: false // asegúrate de esto si estás en Angular >= 15 y no quieres usar standalone
})
export class CustomCurrencyPipe implements PipeTransform {
  constructor(private currencyPipe: CurrencyPipe) {}

  transform(
    value: number | string,
    // currencyCode: string = 'USD',
    // display: 'symbol' | 'code' | 'symbol-narrow' | string = 'symbol',
    // digitsInfo: string = '1.2-2',
    // locale: string = 'es'
  ): string | null {
    return this.currencyPipe.transform(value,);
  }
}
