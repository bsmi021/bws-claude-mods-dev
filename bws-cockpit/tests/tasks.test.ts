import { describe, expect, test } from 'claude-code/testing'
import { barCells, taskProgress, taskSeen } from '../hooks/tasks'
import type { TaskList } from '../hooks/tasks'

const EMPTY: TaskList = { startedAt: 1, items: [] }

describe('task list', () => {
  test('TodoWrite replaces its own list and keeps the others', () => {
    let l = taskSeen(EMPTY, 'mcp__ccd_turn__update_plan', { items: [{ content: 'a', status: 'completed' }] })
    l = taskSeen(l, 'TodoWrite', { todos: [{ content: 'x', status: 'in_progress' }, { content: 'y' }] })
    l = taskSeen(l, 'TodoWrite', { todos: [{ content: 'x', status: 'completed' }] })
    expect(l.items.map(t => `${t.text}:${t.status}`)).toEqual(['a:completed', 'x:completed'])
  })

  test('TaskCreate needs its id; TaskUpdate moves and deletes by id', () => {
    expect(taskSeen(EMPTY, 'TaskCreate', { subject: 'no id' })).toBe(EMPTY)
    let l = taskSeen(EMPTY, 'TaskCreate', { subject: 'one' }, '7')
    l = taskSeen(l, 'TaskCreate', { subject: 'two' }, '8')
    l = taskSeen(l, 'TaskUpdate', { taskId: '7', status: 'completed' })
    l = taskSeen(l, 'TaskUpdate', { taskId: '9', status: 'completed' }) // unknown: nothing
    expect(taskProgress(l.items)).toEqual({ done: 1, total: 2, current: 'two' })
    l = taskSeen(l, 'TaskUpdate', { taskId: '8', status: 'deleted' })
    expect(l.items.map(t => t.text)).toEqual(['one'])
  })

  test('the Desktop plan: items, advance, done and start; wrap_up checks it off', () => {
    let l = taskSeen(EMPTY, 'mcp__ccd_turn__update_plan', { items: ['a', 'b', 'c', 'd'].map((content, i) => ({ content, status: i === 0 ? 'in_progress' : 'pending' })) })
    l = taskSeen(l, 'mcp__ccd_turn__update_plan', { advance: true })
    expect(taskProgress(l.items)).toEqual({ done: 1, total: 4, current: 'b' })
    l = taskSeen(l, 'mcp__ccd_turn__update_plan', { done: [2], start: 4 })
    expect(taskProgress(l.items)).toEqual({ done: 2, total: 4, current: 'd' })
    l = taskSeen(l, 'mcp__ccd_turn__wrap_up', { recap: 'x' })
    expect(taskProgress(l.items)).toEqual({ done: 4, total: 4, current: null })
  })

  test('bar cells: a done share shows at least one cell, an unfinished one leaves one empty', () => {
    expect(barCells(0, 5, 10)).toEqual({ fill: 0, empty: 10 })
    expect(barCells(1, 50, 10)).toEqual({ fill: 1, empty: 9 })
    expect(barCells(49, 50, 10)).toEqual({ fill: 9, empty: 1 })
    expect(barCells(5, 5, 10)).toEqual({ fill: 10, empty: 0 })
    expect(barCells(0, 0, 6)).toEqual({ fill: 0, empty: 6 })
  })
})
