export interface FindOptions {
  includeDeleted?: boolean;
  excludeId?: string;
}

/** Equality criteria by field. An array value matches any of its items. */
export type Criteria<T> = Partial<Record<keyof T & string, unknown>>;

/** An own property, or `<relation>.<property>` of a related entity. */
export type SearchField<T> =
  (keyof T & string) | `${keyof T & string}.${string}`;

export interface SearchOptions<T> {
  term?: string;
  fields: SearchField<T>[];
  /**
   * Trim the term, drop a leading `#`, split it on whitespace: every word must
   * match at least one field. Off: the whole term must match one field.
   */
  splitWords?: boolean;
  /** Compare `unaccent(column)` with `unaccent(word)` (needs the extension). */
  ignoreAccents?: boolean;
}

export interface OrderByOptions<T> {
  field: keyof T & string;
  direction: 'ASC' | 'DESC';
}

export interface ListOptions<T> extends FindOptions {
  where?: Criteria<T>;
  search?: SearchOptions<T>;
  relations?: string[];
  orderBy?: OrderByOptions<T>;
}
