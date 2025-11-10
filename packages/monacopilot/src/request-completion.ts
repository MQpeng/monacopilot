import type { Endpoint, RelatedFile } from '@tonyer/monacopilot-core'

import { DEFAULT_MAX_CONTEXT_LINES } from './defaults'
import type { CompletionMetadata, CompletionResponse } from './types/core'
import type {
	ConstructCompletionMetadataParams,
	FetchCompletionItemParams,
	FetchCompletionItemReturn,
} from './types/internal'
import type { CursorPosition, EditorModel } from './types/monaco'
import { getTextAfterCursor, getTextBeforeCursor } from './utils/editor'
import {
	type TruncateTextToMaxLinesOptions,
	truncateTextToMaxLines,
} from './utils/text'

type RequestCompletionItemParams = FetchCompletionItemParams & {
	endpoint: Endpoint
}

let abortController: AbortController | null = null

export const requestCompletionItem = async (
	params: RequestCompletionItemParams,
): Promise<FetchCompletionItemReturn> => {
	const { endpoint, body } = params
	if (abortController) abortController.abort()
	abortController = new AbortController()
	const response = await fetch(endpoint, {
		signal: abortController.signal,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	})
	abortController = null
	if (!response.ok) {
		throw new Error(
			`Error while fetching completion item: ${response.statusText}`,
		)
	}

	const { completion, error } = (await response.json()) as CompletionResponse

	return { completion, error }
}

export const buildCompletionMetadata = ({
	pos,
	mdl,
	options,
}: ConstructCompletionMetadataParams): CompletionMetadata => {
	const {
		filename,
		language,
		technologies,
		relatedFiles,
		maxContextLines = DEFAULT_MAX_CONTEXT_LINES,
	} = options

	const hasRelatedFiles = relatedFiles && relatedFiles.length > 0

	const contextLinesDivisor = hasRelatedFiles ? 3 : 2

	const adjustedMaxContextLines = maxContextLines
		? Math.floor(maxContextLines / contextLinesDivisor)
		: undefined

	const limitText = (
		getTextFn: (pos: CursorPosition, mdl: EditorModel) => string,
		maxLines?: number,
		options?: TruncateTextToMaxLinesOptions,
	): string => {
		const text = getTextFn(pos, mdl)
		return maxLines ? truncateTextToMaxLines(text, maxLines, options) : text
	}

	const processRelatedFiles = (
		files?: RelatedFile[],
		maxLines?: number,
	): RelatedFile[] | undefined => {
		if (!files || !maxLines) return files

		return files.map(({ content, ...otherProps }) => ({
			...otherProps,
			content: truncateTextToMaxLines(content, maxLines),
		}))
	}

	const textBeforeCursor = limitText(
		getTextBeforeCursor,
		adjustedMaxContextLines,
		{
			truncateDirection: 'keepEnd',
		},
	)

	const textAfterCursor = limitText(
		getTextAfterCursor,
		adjustedMaxContextLines,
		{
			truncateDirection: 'keepStart',
		},
	)

	const limitedRelatedFiles = processRelatedFiles(
		relatedFiles,
		adjustedMaxContextLines,
	)

	return {
		filename,
		language,
		technologies,
		relatedFiles: limitedRelatedFiles,
		textBeforeCursor,
		textAfterCursor,
		cursorPosition: pos,
	}
}
