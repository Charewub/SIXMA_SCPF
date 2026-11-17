export const DRAFT_PREFIX='sixma_success_profile_v17_draft_';
export function draftKey(config,uid,id) {return DRAFT_PREFIX+config.projectId+'_'+uid+'_'+id;}
export function answered(answers) {return Object.values(answers).filter(v=>v==='A'||v==='B').length;}
export class AssessmentSession {
  constructor(result,questions) {
    Object.assign(this,result.assessment);
    this.questions=questions;
    this.answers={...result.answers};
    this.syncedAnswers={...this.answers};
    this.index=Math.max(0,Math.min(71,(this.currentPairNo||1)-1));
    this.pending=null;
    this.localOK=true;
  }
  get completed() {return this.status==='Completed';}
  get count() {return this.questions.filter(q=>['A','B'].includes(this.answers[q.id])).length;}
  get dirty() {return this.questions.some(q=>(this.answers[q.id]||'')!==(this.syncedAnswers[q.id]||''));}
  get choices() {return this.questions.map(q=>this.answers[q.id]||'');}
  serialize() {
    return {assessment_id:this.id,questionnaire_version:this.questionnaireVersion,base_revision:this.revision,
      answers:this.answers,question_index:this.index,pending:this.pending,updated_at:new Date().toISOString()};
  }
  canRestore(draft) {
    return !!draft && !this.completed && draft.assessment_id===this.id
      && draft.questionnaire_version===this.questionnaireVersion
      && Number(draft.base_revision)===this.revision
      && this.questions.some(q=>(draft.answers?.[q.id]||'')!==(this.answers[q.id]||''));
  }
  restore(draft) {
    if(!this.canRestore(draft))throw new Error('LOCAL_DRAFT_REVISION_MISMATCH');
    for(const q of this.questions) {
      const value=draft.answers?.[q.id];
      // A blank answer may intentionally replace a previously selected answer.
      if(['A','B',''].includes(value))this.answers[q.id]=value;
    }
    this.index=Math.max(0,Math.min(71,Number(draft.question_index)||0));
    this.pending=draft.pending||null;
  }
  request(mode,uuid) {
    const signature=JSON.stringify(this.choices);
    if(!this.pending || this.pending.signature!==signature || (this.pending.mode||'save')!==mode) {
      this.pending={requestId:uuid(),signature,mode};
    }
    return {assessment_id:this.id,request_id:this.pending.requestId,expected_revision:this.revision,
      answers:this.choices,current_pair_no:this.index+1};
  }
  accept(result,mode) {
    if(!result?.ok || result.assessment_id!==this.id || !Number.isInteger(result.revision)
      || result.answered_count!==this.count || (mode==='submit' && result.status!=='Completed')) {
      throw new Error('Save was not confirmed. Your local draft is retained.');
    }
    this.revision=result.revision;
    this.status=result.status;
    this.answeredCount=result.answered_count;
    this.updatedAt=result.saved_at;
    this.completedAt=result.completed_at;
    this.syncedAnswers={...this.answers};
    this.pending=null;
  }
}
