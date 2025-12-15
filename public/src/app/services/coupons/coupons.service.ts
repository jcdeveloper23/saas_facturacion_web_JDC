import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Coupon, CouponUsage } from 'app/interfaces/coupon';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import firebase from 'firebase/app';

@Injectable({
  providedIn: 'root'
})
export class CouponsService {

  private readonly COUPONS_COLLECTION = 'coupons';
  private readonly COUPON_USAGE_COLLECTION = 'coupon_usage';

  constructor(private db: AngularFirestore) { }

  // ==================== MÉTODOS CRUD BÁSICOS ====================

  /**
   * Crea un nuevo cupón
   * @param coupon - Datos del cupón a crear
   * @returns Promise con el ID del cupón creado
   */
  public async createCoupon(coupon: Coupon): Promise<string> {
    const couponData = {
      ...coupon,
      couponCreatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      couponUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      couponCurrentUses: coupon.couponCurrentUses || 0,
      couponIsActive: coupon.couponIsActive !== undefined ? coupon.couponIsActive : true
    };

    const docRef = await this.db.collection(this.COUPONS_COLLECTION).add(couponData);

    // Actualizar el documento con su propio ID
    await docRef.update({ couponId: docRef.id });

    return docRef.id;
  }

  /**
   * Actualiza un cupón existente
   * @param couponId - ID del cupón a actualizar
   * @param coupon - Datos del cupón a actualizar
   */
  public updateCoupon(couponId: string, coupon: Partial<Coupon>): Promise<void> {
    const couponData = {
      ...coupon,
      couponUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    return this.db.collection(this.COUPONS_COLLECTION).doc(couponId).update(couponData);
  }

  /**
   * Elimina un cupón
   * @param couponId - ID del cupón a eliminar
   */
  public deleteCoupon(couponId: string): Promise<void> {
    return this.db.collection(this.COUPONS_COLLECTION).doc(couponId).delete();
  }

  /**
   * Obtiene un cupón por su ID
   * @param couponId - ID del cupón
   */
  public getCouponById(couponId: string): Observable<Coupon | undefined> {
    return this.db.collection(this.COUPONS_COLLECTION).doc<Coupon>(couponId).valueChanges();
  }

  /**
   * Busca un cupón por su código
   * @param couponCode - Código del cupón
   */
  public getCouponByCode(couponCode: string): Observable<Coupon | undefined> {
    return this.db.collection<Coupon>(this.COUPONS_COLLECTION, ref =>
      ref.where('couponCode', '==', couponCode).limit(1)
    ).valueChanges({ idField: 'couponId' }).pipe(
      map(coupons => coupons.length > 0 ? coupons[0] : undefined)
    );
  }

  /**
   * Obtiene todos los cupones
   */
  public getAllCoupons(): Observable<Coupon[]> {
    // Sin orderBy para evitar errores de índice en Firestore
    // Se puede ordenar en el componente después de obtener los datos
    return this.db.collection<Coupon>(this.COUPONS_COLLECTION).valueChanges({ idField: 'couponId' });
  }

  /**
   * Obtiene cupones activos
   */
  public getActiveCoupons(): Observable<Coupon[]> {
    return this.db.collection<Coupon>(this.COUPONS_COLLECTION, ref =>
      ref.where('couponIsActive', '==', true)
    ).valueChanges({ idField: 'couponId' });
  }

  /**
   * Obtiene cupones por tipo
   * @param type - Tipo de cupón ('public', 'private', 'automatic')
   */
  public getCouponsByType(type: 'public' | 'private' | 'automatic'): Observable<Coupon[]> {
    return this.db.collection<Coupon>(this.COUPONS_COLLECTION, ref =>
      ref.where('couponType', '==', type)
    ).valueChanges({ idField: 'couponId' });
  }

  /**
   * Obtiene cupones por campaña
   * @param campaignId - ID de la campaña
   */
  public getCouponsByCampaign(campaignId: string): Observable<Coupon[]> {
    return this.db.collection<Coupon>(this.COUPONS_COLLECTION, ref =>
      ref.where('couponCampaignId', '==', campaignId)
    ).valueChanges({ idField: 'couponId' });
  }

  /**
   * Obtiene los tipos de servicio disponibles (para el selector)
   * Los tipos de servicio están en la colección 'categories' con type='service'
   */
  public getServiceTypes(): Observable<any[]> {
    return this.db.collection('categories', ref =>
      ref.where('categoriesType', '==', 'service')
    ).valueChanges({ idField: 'id' });
  }

  // ==================== MÉTODOS DE GESTIÓN ====================

  /**
   * Activa o desactiva un cupón
   * @param couponId - ID del cupón
   * @param isActive - Estado activo/inactivo
   */
  public toggleCouponStatus(couponId: string, isActive: boolean): Promise<void> {
    return this.updateCoupon(couponId, { couponIsActive: isActive });
  }

  /**
   * Incrementa el contador de usos de un cupón
   * @param couponId - ID del cupón
   */
  public incrementUsage(couponId: string): Promise<void> {
    return this.db.collection(this.COUPONS_COLLECTION).doc(couponId).update({
      couponCurrentUses: firebase.firestore.FieldValue.increment(1)
    });
  }

  /**
   * Genera un código de cupón aleatorio
   * @param length - Longitud del código (por defecto 8)
   * @param prefix - Prefijo opcional
   */
  public generateCouponCode(length: number = 8, prefix?: string): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin caracteres ambiguos
    let code = '';

    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return prefix ? `${prefix}_${code}` : code;
  }

  /**
   * Verifica si un código de cupón ya existe
   * @param couponCode - Código a verificar
   */
  public async checkCouponCodeExists(couponCode: string): Promise<boolean> {
    const snapshot = await this.db.collection(this.COUPONS_COLLECTION, ref =>
      ref.where('couponCode', '==', couponCode).limit(1)
    ).get().toPromise();

    return !snapshot.empty;
  }

  // ==================== ESTADÍSTICAS ====================

  /**
   * Obtiene estadísticas generales de cupones
   */
  public async getCouponStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    expired: number;
    totalUsage: number;
  }> {
    const couponsSnapshot = await this.db.collection<Coupon>(this.COUPONS_COLLECTION).get().toPromise();
    const coupons = couponsSnapshot.docs.map(doc => doc.data());

    const now = new Date();

    return {
      total: coupons.length,
      active: coupons.filter(c => c.couponIsActive === true).length,
      inactive: coupons.filter(c => c.couponIsActive === false).length,
      expired: coupons.filter(c => {
        if (!c.couponEndDate) return false;
        const endDate = (c.couponEndDate as any).toDate ? (c.couponEndDate as any).toDate() : new Date(c.couponEndDate);
        return endDate < now;
      }).length,
      totalUsage: coupons.reduce((sum, c) => sum + (c.couponCurrentUses || 0), 0)
    };
  }

  // ==================== HISTORIAL DE USO ====================

  /**
   * Registra el uso de un cupón
   * @param usage - Datos del uso del cupón
   */
  public async registerCouponUsage(usage: CouponUsage): Promise<void> {
    const usageData = {
      ...usage,
      usedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await this.db.collection(this.COUPON_USAGE_COLLECTION).add(usageData);

    // Incrementar contador de usos
    if (usage.couponId) {
      await this.incrementUsage(usage.couponId);
    }
  }

  /**
   * Obtiene el historial de uso de un cupón
   * @param couponId - ID del cupón
   */
  public getCouponUsageHistory(couponId: string): Observable<CouponUsage[]> {
    return this.db.collection<CouponUsage>(this.COUPON_USAGE_COLLECTION, ref =>
      ref.where('couponId', '==', couponId)
    ).valueChanges({ idField: 'usageId' });
  }

  /**
   * Obtiene el historial de cupones usados por un usuario
   * @param userId - UID del usuario
   */
  public getUserCouponUsageHistory(userId: string): Observable<CouponUsage[]> {
    return this.db.collection<CouponUsage>(this.COUPON_USAGE_COLLECTION, ref =>
      ref.where('userId', '==', userId)
    ).valueChanges({ idField: 'usageId' });
  }

  /**
   * Cuenta cuántas veces un usuario ha usado un cupón específico
   * @param userId - UID del usuario
   * @param couponId - ID del cupón
   */
  public async getUserCouponUsageCount(userId: string, couponId: string): Promise<number> {
    const snapshot = await this.db.collection(this.COUPON_USAGE_COLLECTION, ref =>
      ref.where('userId', '==', userId)
        .where('couponId', '==', couponId)
    ).get().toPromise();

    return snapshot.size;
  }

  // ==================== MÉTODOS DE COMPATIBILIDAD (LEGACY) ====================
  // Estos métodos mantienen compatibilidad con el módulo inventory/coupons

  /**
   * @deprecated Use createCoupon instead
   */
  public saveCoupon(coupon: Coupon): Promise<void> {
    return this.db.collection(this.COUPONS_COLLECTION).doc(`${coupon.couponCode}`).set(coupon);
  }

  /**
   * @deprecated Use getCouponsByProvider instead
   */
  public getCoupons(provider_id: string): Observable<Coupon[]> {
    return this.db.collection<Coupon>(this.COUPONS_COLLECTION, ref =>
      ref.where('coupon_provider_id', '==', provider_id)
    ).valueChanges();
  }
}
