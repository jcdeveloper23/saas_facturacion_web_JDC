import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class HelpQuestionsService {

  constructor(
    private db: AngularFirestore
  ) { }

  /**
   * Obtener todas las preguntas de ayuda
   */
  public getHelpQuestions(): Observable<HelpQuestion[]> {
    return this.db.collection<HelpQuestion>('helpQuestions', ref =>
      ref.orderBy('helpQuestionOrder', 'asc')
    ).valueChanges();
  }

  /**
   * Obtener preguntas por categoría
   */
  public getQuestionsByCategory(categoryId: string): Observable<HelpQuestion[]> {
    return this.db.collection<HelpQuestion>('helpQuestions', ref =>
      ref.where('helpQuestionCategoryId', '==', categoryId)
         .orderBy('helpQuestionOrder', 'asc')
    ).valueChanges();
  }

  /**
   * Obtener preguntas activas por categoría
   */
  public getActiveQuestionsByCategory(categoryId: string): Observable<HelpQuestion[]> {
    return this.db.collection<HelpQuestion>('helpQuestions', ref =>
      ref.where('helpQuestionCategoryId', '==', categoryId)
         .where('helpQuestionState', '==', true)
         .orderBy('helpQuestionOrder', 'asc')
    ).valueChanges();
  }

  /**
   * Obtener preguntas populares
   */
  public getPopularQuestions(): Observable<HelpQuestion[]> {
    return this.db.collection<HelpQuestion>('helpQuestions', ref =>
      ref.where('helpQuestionIsPopular', '==', true)
         .where('helpQuestionState', '==', true)
         .orderBy('helpQuestionViews', 'desc')
         .limit(10)
    ).valueChanges();
  }

  /**
   * Obtener una pregunta por ID
   */
  public getQuestionById(id: string): Observable<HelpQuestion> {
    return this.db.collection<HelpQuestion>('helpQuestions')
      .doc(id)
      .valueChanges();
  }

  /**
   * Guardar nueva pregunta
   */
  public saveQuestion(question: HelpQuestion): Promise<void> {
    return this.db.collection('helpQuestions').doc(question.helpQuestionId).set(question);
  }

  /**
   * Editar pregunta
   */
  public editQuestion(question: HelpQuestion): Promise<void> {
    return this.db.collection('helpQuestions').doc(question.helpQuestionId).update(question);
  }

  /**
   * Eliminar pregunta
   */
  public deleteQuestion(questionId: string): Promise<void> {
    return this.db.collection('helpQuestions').doc(questionId).delete();
  }

  /**
   * Incrementar contador de vistas
   */
  public incrementViews(questionId: string): Promise<void> {
    const questionRef = this.db.collection('helpQuestions').doc(questionId);
    return this.db.firestore.runTransaction(async transaction => {
      const doc = await transaction.get(questionRef.ref);
      if (doc.exists) {
        // const currentViews = doc.data().helpQuestionViews || 0;
        // transaction.update(questionRef.ref, { helpQuestionViews: currentViews + 1 });
      }
    });
  }

  /**
   * Buscar preguntas por texto
   */
  public searchQuestions(searchTerm: string): Observable<HelpQuestion[]> {
    const search = searchTerm.toLowerCase();
    return this.getHelpQuestions().pipe(
      map(questions => questions.filter(q =>
        q.helpQuestionTitle?.toLowerCase().includes(search) ||
        q.helpQuestionDescription?.toLowerCase().includes(search) ||
        q.helpQuestionAnswer?.toLowerCase().includes(search) ||
        q.helpQuestionTags?.some(tag => tag.toLowerCase().includes(search))
      ))
    );
  }

  /**
   * Obtener el siguiente número de orden disponible para una categoría
   */
  public getNextOrderByCategory(categoryId: string): Observable<number> {
    return this.db.collection<HelpQuestion>('helpQuestions', ref =>
      ref.where('helpQuestionCategoryId', '==', categoryId)
         .orderBy('helpQuestionOrder', 'desc')
         .limit(1)
    ).valueChanges().pipe(
      map(questions => {
        if (questions && questions.length > 0) {
          return (questions[0].helpQuestionOrder || 0) + 1;
        }
        return 1;
      })
    );
  }

  /**
   * Contar preguntas por categoría
   */
  public countQuestionsByCategory(categoryId: string): Observable<number> {
    return this.getQuestionsByCategory(categoryId).pipe(
      map(questions => questions.length)
    );
  }
}
