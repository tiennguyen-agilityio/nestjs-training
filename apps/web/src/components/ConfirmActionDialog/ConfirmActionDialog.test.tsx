import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'

import ConfirmActionDialog from '@/components/ConfirmActionDialog'

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))

interface Item {
  id?: string
  name: string
}

type Mutate = (
  id: string,
  options: { onSuccess: () => void; onError: (error: unknown) => void },
) => void

const TITLE = 'Delete item?'
const SUCCESS = 'Item deleted'

function Harness({
  item,
  mutate,
  isPending = false,
  onClose,
  textCancel,
  formatError,
}: {
  item: Item
  mutate: Mutate
  isPending?: boolean
  onClose?: () => void
  textCancel?: string
  formatError?: (error: unknown) => string
}) {
  const [pending, setPending] = useState<Item | null>(null)
  return (
    <>
      <button type="button" onClick={() => setPending(item)}>
        Open
      </button>
      <ConfirmActionDialog
        item={pending}
        onClose={() => {
          onClose?.()
          setPending(null)
        }}
        mutate={mutate}
        isPending={isPending}
        successMessage={SUCCESS}
        title={TITLE}
        renderDescription={(current) => <p>Remove {current?.name}</p>}
        textAction="Delete"
        textCancel={textCancel}
        formatError={formatError}
        data-testid="modal-confirm-delete-item"
      >
        <span>preview</span>
      </ConfirmActionDialog>
    </>
  )
}

const item: Item = { id: 'item-1', name: 'Arabica' }

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByText(TITLE)
}

describe('ConfirmActionDialog', () => {
  beforeEach(() => {
    jest.mocked(toast.success).mockClear()
  })

  it('calls mutate with the item id on confirm', async () => {
    const user = userEvent.setup()
    const mutate = jest.fn()
    render(<Harness item={item} mutate={mutate} />)

    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(mutate).toHaveBeenCalledWith('item-1', expect.any(Object))
  })

  it('toasts, clears and closes on success', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    const mutate: Mutate = (_id, options) => options.onSuccess()
    render(<Harness item={item} mutate={mutate} onClose={onClose} />)

    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(toast.success).toHaveBeenCalledWith(SUCCESS)
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.queryByText(TITLE)).not.toBeInTheDocument(),
    )
  })

  it('shows the error and stays open on failure', async () => {
    const user = userEvent.setup()
    const mutate: Mutate = (_id, options) => options.onError(new Error('Nope'))
    render(<Harness item={item} mutate={mutate} />)

    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Nope')).toHaveAttribute('role', 'alert')
    expect(screen.getByText(TITLE)).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('clears the error when confirming again', async () => {
    const user = userEvent.setup()
    const mutate = jest
      .fn<void, Parameters<Mutate>>()
      .mockImplementationOnce((_id, options) =>
        options.onError(new Error('Nope')),
      )
      .mockImplementationOnce(() => undefined)
    render(<Harness item={item} mutate={mutate} />)

    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByText('Nope')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(mutate).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Nope')).not.toBeInTheDocument()
  })

  it('ignores close while pending', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(
      <Harness item={item} mutate={jest.fn()} isPending onClose={onClose} />,
    )

    await openDialog(user)
    await user.keyboard('{Escape}')

    expect(screen.getByText(TITLE)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows no old error when reopened', async () => {
    const user = userEvent.setup()
    const mutate: Mutate = (_id, options) => options.onError(new Error('Nope'))
    render(<Harness item={item} mutate={mutate} />)

    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByText('Nope')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.queryByText(TITLE)).not.toBeInTheDocument(),
    )

    await openDialog(user)
    expect(screen.queryByText('Nope')).not.toBeInTheDocument()
  })

  it('does not call mutate without an id', async () => {
    const user = userEvent.setup()
    const mutate = jest.fn()
    render(<Harness item={{ name: 'No id' }} mutate={mutate} />)

    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(mutate).not.toHaveBeenCalled()
  })

  it('renders the description and children for the item', async () => {
    const user = userEvent.setup()
    render(<Harness item={item} mutate={jest.fn()} />)

    await openDialog(user)

    expect(screen.getByText('Remove Arabica')).toBeInTheDocument()
    expect(screen.getByText('preview')).toBeInTheDocument()
    expect(screen.getByTestId('modal-confirm-delete-item')).toBeInTheDocument()
  })

  it('uses Cancel as the cancel label by default and textCancel when given', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness item={item} mutate={jest.fn()} />)
    await openDialog(user)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    unmount()

    render(<Harness item={item} mutate={jest.fn()} textCancel="Keep it" />)
    await openDialog(user)
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it("shows formatError's text for a failed mutation when given, getErrorMessage otherwise", async () => {
    const user = userEvent.setup()
    const failing: Mutate = (_id, { onError }) =>
      onError(new Error('Raw API text'))
    const { unmount } = render(<Harness item={item} mutate={failing} />)
    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Raw API text')).toBeInTheDocument()
    unmount()

    render(
      <Harness
        item={item}
        mutate={failing}
        formatError={() => 'Friendly text'}
      />,
    )
    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Friendly text')).toBeInTheDocument()
    expect(screen.queryByText('Raw API text')).toBeNull()
  })
})
