import FirstLetters from '../../exercises/FirstLetters'
import type { StepProps } from '../types'

/**
 * Ввод первых букв слов. Уровень сложности: 1 — слова видны целиком, 2 — видна примерно половина,
 * 3 — слова не видны, есть только пробелы. Ошибочное слово сразу открывается красным.
 */
export default function FirstLettersVerse({ verse, settings, onAnswer }: StepProps) {
  return (
    <FirstLetters
      content={verse.text}
      difficulty={settings.hintLevel ?? 1}
      embedded
      onComplete={(score) => onAnswer({ score })}
    />
  )
}
