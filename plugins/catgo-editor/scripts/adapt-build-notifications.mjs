// Embedding-only compatibility fix. Upstream push_to_undo queues a notification
// before an async build starts; that microtask sees the old structure. Notify
// again at the actual build commit, using upstream's own coalescing function.
// Never rewrite the CatGo checkout. Fail closed if this seam changes upstream.
export const buildNotificationAdaptation = 'notify embedding host after build-tools structure commit v1'

export function adaptBuildNotifications(source) {
  source = source.replaceAll('\r\n', '\n')
  const prefix = 'build = create_build_tools_controller({\n    get_structure: () => structure,\n    '
  const before = prefix + 'set_structure: (s) => { structure = s as typeof structure },'
  const after = prefix + 'set_structure: (s) => { structure = s as typeof structure; notify_structure_change() },'
  if (source.split(after).length === 2 && !source.includes(before)) return source
  if (source.split(before).length !== 2) throw Error('CatGo build-tools commit notification seam changed; review the embedding adapter')
  return source.replace(before, after)
}
