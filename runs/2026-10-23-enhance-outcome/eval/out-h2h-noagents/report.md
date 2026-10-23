# Enhancer models head to head (new prompt)

30 blind 3-way rankings (opus judge).

| model | 1st | 2nd | 3rd | mean rank |
| --- | --- | --- | --- | --- |
| haiku | 20 | 1 | 9 | 1.63 |
| sonnet | 7 | 17 | 6 | 1.97 |
| opus | 3 | 12 | 15 | 2.40 |

| case | 1st per sample |
| --- | --- |
| typo | haiku, opus, haiku |
| linux-tests | haiku, sonnet, sonnet |
| it-ref | haiku, haiku, haiku |
| pasted-error | haiku, haiku, haiku |
| dark-mode | haiku, haiku, haiku |
| method-given | opus, sonnet, sonnet |
| perf | haiku, haiku, haiku |
| investigate | haiku, haiku, haiku |
| new-mod | haiku, sonnet, haiku |
| docs | sonnet, opus, sonnet |