import type { Difficulty } from '../types'

export interface ExerciseProps {
  content: string
  difficulty: Difficulty
  /** Вызывается, когда упражнение закончено. score — точность 0–100 */
  onComplete: (score: number) => void
}
