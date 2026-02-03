import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, Subject, throwError } from 'rxjs';
import { map, tap, catchError, delay, concatMap } from 'rxjs/operators';

/**
 * Nominatim API response interface
 */
interface NominatimResponse {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  boundingbox: string[];
}

/**
 * Geocoded address result
 */
export interface GeocodedAddress {
  fullAddress: string;
  road?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
}

/**
 * Geocoding Service - Reverse geocoding using OpenStreetMap Nominatim
 *
 * IMPORTANT: Nominatim Usage Policy
 * - Max 1 request per second
 * - Must include a valid User-Agent header
 * - Cache results to minimize requests
 *
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */
@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  private http = inject(HttpClient);

  private readonly nominatimUrl = 'https://nominatim.openstreetmap.org/reverse';
  private readonly rateLimit = 1100; // 1.1 seconds to be safe with Nominatim policy

  // In-memory cache for geocoded addresses
  private cache = new Map<string, GeocodedAddress>();

  // Queue for rate limiting
  private requestQueue = new Subject<{
    lat: number;
    lng: number;
    resolve: (value: GeocodedAddress | null) => void;
    reject: (error: any) => void;
  }>();

  private isProcessing = false;

  constructor() {
    this.processQueue();
  }

  /**
   * Process the request queue with rate limiting
   */
  private processQueue(): void {
    this.requestQueue.pipe(
      concatMap(request => {
        return of(request).pipe(
          delay(this.isProcessing ? this.rateLimit : 0),
          tap(() => this.isProcessing = true),
          concatMap(req => {
            return this.doReverseGeocode(req.lat, req.lng).pipe(
              tap(result => req.resolve(result)),
              catchError(error => {
                req.reject(error);
                return of(null);
              })
            );
          })
        );
      })
    ).subscribe();
  }

  /**
   * Reverse geocode coordinates to address
   * Uses caching and rate limiting to comply with Nominatim policy
   *
   * @param lat Latitude
   * @param lng Longitude
   * @returns Observable with geocoded address or null if not found
   */
  reverseGeocode(lat: number, lng: number): Observable<GeocodedAddress | null> {
    // Round coordinates to 5 decimal places for cache key (about 1m precision)
    const cacheKey = this.getCacheKey(lat, lng);

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return of(this.cache.get(cacheKey)!);
    }

    // Add to queue for rate-limited processing
    return new Observable(observer => {
      this.requestQueue.next({
        lat,
        lng,
        resolve: (result) => {
          observer.next(result);
          observer.complete();
        },
        reject: (error) => {
          observer.error(error);
        }
      });
    });
  }

  /**
   * Perform the actual reverse geocoding request
   */
  private doReverseGeocode(lat: number, lng: number): Observable<GeocodedAddress | null> {
    const cacheKey = this.getCacheKey(lat, lng);

    // Double-check cache (might have been populated while waiting in queue)
    if (this.cache.has(cacheKey)) {
      return of(this.cache.get(cacheKey)!);
    }

    const headers = new HttpHeaders({
      'Accept': 'application/json'
    });

    const params = {
      lat: lat.toString(),
      lon: lng.toString(),
      format: 'json',
      addressdetails: '1',
      zoom: '18'
    };

    return this.http.get<NominatimResponse>(this.nominatimUrl, { headers, params }).pipe(
      map(response => this.parseResponse(response)),
      tap(result => {
        if (result) {
          this.cache.set(cacheKey, result);
        }
      }),
      catchError(error => {
        console.error('Geocoding error:', error);
        return of(null);
      })
    );
  }

  /**
   * Parse Nominatim response to GeocodedAddress
   */
  private parseResponse(response: NominatimResponse): GeocodedAddress | null {
    if (!response || !response.display_name) {
      return null;
    }

    const address = response.address || {};

    return {
      fullAddress: response.display_name,
      road: address.road,
      city: address.city || address.town || address.village,
      state: address.state,
      country: address.country,
      postcode: address.postcode
    };
  }

  /**
   * Generate cache key from coordinates
   */
  private getCacheKey(lat: number, lng: number): string {
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
  }

  /**
   * Get short address (road + city)
   */
  getShortAddress(address: GeocodedAddress): string {
    const parts: string[] = [];
    if (address.road) parts.push(address.road);
    if (address.city) parts.push(address.city);
    return parts.length > 0 ? parts.join(', ') : address.fullAddress;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Batch reverse geocode multiple coordinates
   * Returns an object mapping coordinates to addresses
   */
  batchReverseGeocode(coordinates: { lat: number; lng: number }[]): Observable<Map<string, GeocodedAddress | null>> {
    const results = new Map<string, GeocodedAddress | null>();
    let completed = 0;

    return new Observable(observer => {
      if (coordinates.length === 0) {
        observer.next(results);
        observer.complete();
        return;
      }

      coordinates.forEach(coord => {
        const key = this.getCacheKey(coord.lat, coord.lng);
        this.reverseGeocode(coord.lat, coord.lng).subscribe({
          next: (address) => {
            results.set(key, address);
            completed++;
            if (completed === coordinates.length) {
              observer.next(results);
              observer.complete();
            }
          },
          error: (error) => {
            results.set(key, null);
            completed++;
            if (completed === coordinates.length) {
              observer.next(results);
              observer.complete();
            }
          }
        });
      });
    });
  }
}
