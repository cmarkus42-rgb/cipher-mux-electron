export interface NoteFrontmatter {
  title: string
  tags: string[]
  created: string
  modified: string
}

export interface NoteFile {
  frontmatter: NoteFrontmatter
  body: string
  filePath: string
}
