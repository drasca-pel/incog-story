import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient'
import './App.css'

const GENRES = [
  'Horror & Mystery',
  'Love & Drama',
  'Adventure & Fantasy',
]

const DEMO = [
  {
    id: 'demo-1',
    title: 'The Strange Noise',
    genre: 'Horror & Mystery',
    opening_text:
      'At exactly midnight, three knocks came from the locked room upstairs. The house had been empty for years, and you were certain you were alone.',
    story_text:
      'At exactly midnight, three knocks came from the locked room upstairs. The house had been empty for years, and you were certain you were alone.',
    reference_header: 'Every choice changes what happens next.',
    cover_image_url:
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1000&q=85',
    status: 'published',
    poll_history: [
      {
        id: 'demo-poll-1',
        prompt: 'What should happen next?',
        status: 'open',
        closes_at: null,
        options: [
          {
            id: 'demo-option-1',
            label: 'A',
            continuation_text:
              'You climb the stairs and slowly turn the handle. The room is cold, and a dusty music box is playing by itself.',
            votes: 12,
          },
          {
            id: 'demo-option-2',
            label: 'B',
            continuation_text:
              'You call a friend for help, but their voice suddenly comes from upstairs instead of your phone.',
            votes: 8,
          },
          {
            id: 'demo-option-3',
            label: 'C',
            continuation_text:
              'You leave the house. Outside, every window is glowing, including the windows of the room you just left.',
            votes: 5,
          },
        ],
      },
    ],
  },
  {
    id: 'demo-2',
    title: 'The Last Message',
    genre: 'Love & Drama',
    opening_text:
      'Your phone lights up with a message from someone who disappeared from your life years ago. It contains only one sentence: "We need to talk."',
    story_text:
      'Your phone lights up with a message from someone who disappeared from your life years ago. It contains only one sentence: "We need to talk."',
    reference_header: 'Some messages should never arrive.',
    cover_image_url:
      'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=85',
    status: 'published',
    poll_history: [
      {
        id: 'demo-poll-2',
        prompt: 'What do you do?',
        status: 'open',
        closes_at: null,
        options: [
          {
            id: 'demo-option-4',
            label: 'A',
            continuation_text:
              'You reply immediately. Three dots appear, disappear, and then a photograph arrives.',
            votes: 9,
          },
          {
            id: 'demo-option-5',
            label: 'B',
            continuation_text:
              'You ignore the message, but the sender calls before you can put your phone down.',
            votes: 7,
          },
          {
            id: 'demo-option-6',
            label: 'C',
            continuation_text:
              'You search the sender’s name and discover a post published just five minutes ago.',
            votes: 4,
          },
        ],
      },
    ],
  },
  {
    id: 'demo-3',
    title: 'Beyond the Map',
    genre: 'Adventure & Fantasy',
    opening_text:
      'The map ends at a black mountain. Yet the compass keeps pointing beyond it, toward a place no explorer has ever recorded.',
    story_text:
      'The map ends at a black mountain. Yet the compass keeps pointing beyond it, toward a place no explorer has ever recorded.',
    reference_header: 'The unknown is waiting.',
    cover_image_url:
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=85',
    status: 'published',
    poll_history: [],
  },
]

const EMPTY_FORM = {
  title: '',
  genre: GENRES[0],
  intro: '',
  image: '',
  prompt: '',
  reference: '',
  a: '',
  b: '',
  c: '',
  closesAt: '',
}

function isPollOpen(poll) {
  if (!poll || poll.status !== 'open') return false

  return (
    !poll.closes_at ||
    new Date(poll.closes_at).getTime() > Date.now()
  )
}

function displayName(user) {
  return (
    user?.user_metadata?.full_name?.trim() ||
    user?.email?.split('@')[0] ||
    'Guest reader'
  )
}

function shareUrl(storyId, pollId = null) {
  const url = new URL(window.location.href)
  url.searchParams.set('story', storyId)

  if (pollId) url.searchParams.set('poll', pollId)
  else url.searchParams.delete('poll')

  return url.toString()
}

function App() {
  const [stories, setStories] = useState([])
  const [selected, setSelected] = useState(null)
  const [page, setPage] = useState('Discover')
  const [genre, setGenre] = useState('All stories')
  const [search, setSearch] = useState('')

  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [notice, setNotice] = useState('')
  const [authNotice, setAuthNotice] = useState('')

  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [voted, setVoted] = useState({})
  const [form, setForm] = useState(EMPTY_FORM)
  const [adminTab, setAdminTab] = useState('Create story')

  const [editingStoryId, setEditingStoryId] = useState(null)
  const [editingDetails, setEditingDetails] = useState(false)

  const [selectedPollId, setSelectedPollId] = useState(null)
  const [showPollHistory, setShowPollHistory] = useState(false)

  const loadStories = useCallback(async () => {
    if (!supabaseConfigured) {
      setStories(DEMO)

      const params = new URLSearchParams(window.location.search)
      const storyId = params.get('story')
      const pollId = params.get('poll')

      const story =
        DEMO.find((item) => item.id === storyId) || DEMO[0]

      setSelected(story)
      setSelectedPollId(
        story.poll_history.some((poll) => poll.id === pollId)
          ? pollId
          : null,
      )
      return
    }

    try {
      const { data: storyRows, error: storyError } = await supabase
        .from('stories')
        .select('*')
        .in('status', ['published', 'archived'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (storyError) {
        if (storyError.message?.includes('deleted_at')) {
          const retry = await supabase
            .from('stories')
            .select('*')
            .in('status', ['published', 'archived'])
            .order('created_at', { ascending: false })

          if (retry.error) throw retry.error

          await assembleStories(retry.data || [])
          return
        }

        throw storyError
      }

      await assembleStories(storyRows || [])
    } catch (error) {
      console.error('Could not load stories:', error)
      setNotice(error.message || 'Could not load stories.')
    }

    async function assembleStories(rows) {
      if (!rows.length) {
        setStories([])
        setSelected(null)
        setSelectedPollId(null)
        return
      }

      const storyIds = rows.map((story) => story.id)

      const { data: polls, error: pollError } = await supabase
        .from('polls')
        .select('*')
        .in('story_id', storyIds)
        .order('created_at', { ascending: false })

      if (pollError) throw pollError

      const pollRows = polls || []
      const pollIds = pollRows.map((poll) => poll.id)

      let optionRows = []

      if (pollIds.length) {
        const { data, error } = await supabase
          .from('story_options')
          .select('*')
          .in('poll_id', pollIds)
          .order('position', { ascending: true })

        if (error) throw error
        optionRows = data || []
      }

      const optionsByPoll = new Map()

      for (const option of optionRows) {
        const list = optionsByPoll.get(option.poll_id) || []
        list.push({ ...option, votes: 0 })
        optionsByPoll.set(option.poll_id, list)
      }

      const pollsWithOptions = await Promise.all(
        pollRows.map(async (poll) => {
          const { data: results, error: resultsError } =
            await supabase.rpc('get_poll_results', {
              p_poll_id: poll.id,
            })

          const resultMap = new Map()

          if (!resultsError && Array.isArray(results)) {
            for (const result of results) {
              resultMap.set(
                result.option_id,
                Number(result.vote_count || 0),
              )
            }
          }

          const options = (optionsByPoll.get(poll.id) || []).map(
            (option) => ({
              ...option,
              votes: resultMap.get(option.id) || 0,
            }),
          )

          return { ...poll, options }
        }),
      )

      const combined = rows.map((story) => {
        const history = pollsWithOptions
          .filter((poll) => poll.story_id === story.id)
          .sort(
            (a, b) =>
              new Date(b.created_at || 0).getTime() -
              new Date(a.created_at || 0).getTime(),
          )

        return {
          ...story,
          poll_history: history,
          active_poll:
            history.find(isPollOpen) || history[0] || null,
        }
      })

      setStories(combined)

      const params = new URLSearchParams(window.location.search)
      const requestedStoryId = params.get('story')
      const requestedPollId = params.get('poll')

      const nextStory =
        combined.find((item) => item.id === requestedStoryId) ||
        combined.find((item) => item.id === selected?.id) ||
        combined.find((item) => item.status === 'published') ||
        combined[0] ||
        null

      setSelected(nextStory)

      const matchingPoll = nextStory?.poll_history?.find(
        (poll) => poll.id === requestedPollId,
      )

      setSelectedPollId(matchingPoll?.id || null)
    }
  }, [selected?.id])

  const checkAdmin = useCallback(async (currentSession) => {
    if (!currentSession?.user || !supabaseConfigured) {
      setIsAdmin(false)
      return
    }

    const { data, error } = await supabase.rpc(
      'is_current_user_admin',
    )

    if (error) {
      console.error('Admin check failed:', error)
      setIsAdmin(false)
      return
    }

    setIsAdmin(Boolean(data))
  }, [])

  useEffect(() => {
    loadStories()

    if (!supabaseConfigured) return undefined

    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      await checkAdmin(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      checkAdmin(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadStories, checkAdmin])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return stories.filter((story) => {
      if (page === 'Archive' && story.status !== 'archived') {
        return false
      }

      if (page !== 'Archive' && story.status === 'archived') {
        return false
      }

      if (genre !== 'All stories' && story.genre !== genre) {
        return false
      }

      const searchable = [
        story.title,
        story.genre,
        story.opening_text,
        story.story_text,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return !query || searchable.includes(query)
    })
  }, [stories, page, genre, search])

  const active = useMemo(() => {
    if (page === 'Read & vote') {
      return (
        stories.find((story) => story.id === selected?.id) ||
        selected ||
        filtered[0] ||
        null
      )
    }

    return filtered[0] || selected || null
  }, [page, stories, selected, filtered])

  const activePoll = useMemo(() => {
    if (!active) return null

    return (
      active.poll_history?.find(
        (poll) => poll.id === selectedPollId,
      ) ||
      active.poll_history?.find(isPollOpen) ||
      active.active_poll ||
      null
    )
  }, [active, selectedPollId])

  function openStory(story, pollId = null) {
    setSelected(story)
    setSelectedPollId(pollId)
    setShowPollHistory(false)
    setPage('Read & vote')

    const url = new URL(window.location.href)
    url.searchParams.set('story', story.id)

    if (pollId) url.searchParams.set('poll', pollId)
    else url.searchParams.delete('poll')

    window.history.replaceState({}, '', url)
  }

  async function shareStory(story, poll = null) {
    if (!story) return

    const url = shareUrl(story.id, poll?.id)
    const message = `${displayName(session?.user)} is sharing "${story.title}" on Incog Plotline.`

    try {
      if (navigator.share) {
        await navigator.share({
          title: story.title,
          text: message,
          url,
        })
      } else {
        await navigator.clipboard.writeText(`${message}\n${url}`)
        setNotice('Share link copied.')
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setNotice(
          'Could not share the link. You can copy it from your browser address bar.',
        )
      }
    }
  }

  async function authenticate(event) {
    event.preventDefault()
    setAuthNotice('')

    if (!supabaseConfigured) {
      setAuthNotice(
        'Connect Supabase before signing in or creating an account.',
      )
      return
    }

    if (authMode === 'signup' && !fullName.trim()) {
      setAuthNotice('Enter your full name.')
      return
    }

    if (!email.trim() || !password) {
      setAuthNotice('Enter your email address and password.')
      return
    }

    setBusy(true)

    try {
      const result =
        authMode === 'signup'
          ? await supabase.auth.signUp({
              email: email.trim(),
              password,
              options: {
                data: { full_name: fullName.trim() },
              },
            })
          : await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            })

      if (result.error) throw result.error

      if (!result.data.session) {
        setAuthNotice(
          'Supabase did not create a signed-in session. Open Supabase Dashboard → Authentication → Sign In / Providers (or Auth settings), turn off Confirm email, then try creating the account again.',
        )
        return
      }

      setSession(result.data.session)
      setPassword('')
      setShowPassword(false)
      setAuthNotice('')
      setAuthOpen(false)
      setNotice(
        authMode === 'signup'
          ? 'Account created successfully.'
          : 'Signed in successfully.',
      )

      await checkAdmin(result.data.session)
    } catch (error) {
      const message = error.message || 'Authentication failed.'
      const normalized = message.toLowerCase()

      if (
        normalized.includes('email not confirmed') ||
        normalized.includes('email not verified')
      ) {
        setAuthNotice(
          'Email confirmation is still enabled in Supabase. Turn off Confirm email in your Supabase Authentication settings, then try again.',
        )
      } else {
        setAuthNotice(message)
      }
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    setAuthNotice('')

    if (!supabaseConfigured) {
      setAuthNotice('Connect Supabase before signing in with Google.')
      return
    }

    setBusy(true)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (error) throw error
    } catch (error) {
      setAuthNotice(error.message || 'Google sign-in failed.')
      setBusy(false)
    }
  }

  async function signOut() {
    if (supabaseConfigured) {
      const { error } = await supabase.auth.signOut()

      if (error) {
        setNotice(error.message)
        return
      }
    }

    setSession(null)
    setIsAdmin(false)
    setNotice('You have signed out.')
  }

  async function castVote(optionId) {
    if (!session?.user) {
      setAuthMode('signin')
      setAuthNotice('Sign in before voting.')
      setAuthOpen(true)
      return
    }

    if (!supabaseConfigured || !activePoll || !isPollOpen(activePoll)) {
      setNotice('This poll is not open for voting.')
      return
    }

    if (voted[activePoll.id]) {
      setNotice('You have already voted in this poll on this page.')
      return
    }

    setBusy(true)

    try {
      const { error } = await supabase.rpc('cast_story_vote', {
        p_poll_id: activePoll.id,
        p_option_id: optionId,
      })

      if (error) throw error

      setVoted((current) => ({
        ...current,
        [activePoll.id]: optionId,
      }))

      setNotice('Your vote has been submitted.')
      await loadStories()
    } catch (error) {
      setNotice(error.message || 'Could not submit your vote.')
    } finally {
      setBusy(false)
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function prepareNewStory() {
    setEditingStoryId(null)
    setEditingDetails(false)
    setForm(EMPTY_FORM)
    setAdminTab('Create story')
    setPage('Creator Studio')
  }

  function prepareEditStory(story) {
    setEditingStoryId(story.id)
    setEditingDetails(true)
    setForm({
      ...EMPTY_FORM,
      title: story.title || '',
      genre: story.genre || GENRES[0],
      intro: story.opening_text || '',
      image: story.cover_image_url || '',
      reference: story.reference_header || '',
    })
    setAdminTab('Create story')
    setPage('Creator Studio')
  }

  function prepareNextPoll(story) {
    setEditingStoryId(story.id)
    setEditingDetails(false)
    setForm({
      ...EMPTY_FORM,
      title: story.title || '',
      genre: story.genre || GENRES[0],
      intro: story.opening_text || '',
      image: story.cover_image_url || '',
      reference: story.reference_header || '',
    })
    setAdminTab('Create story')
    setPage('Creator Studio')
  }

  async function saveStoryDetails(event) {
    event.preventDefault()

    if (!isAdmin || !editingStoryId || !supabaseConfigured) {
      setNotice('You need administrator access to edit this story.')
      return
    }

    if (!form.title.trim() || !form.intro.trim()) {
      setNotice('Enter a title and opening story.')
      return
    }

    setBusy(true)

    try {
      const { error } = await supabase
        .from('stories')
        .update({
          title: form.title.trim(),
          genre: form.genre,
          opening_text: form.intro.trim(),
          reference_header: form.reference.trim(),
          cover_image_url: form.image.trim() || null,
        })
        .eq('id', editingStoryId)

      if (error) throw error

      setNotice('Story details updated.')
      setEditingStoryId(null)
      setEditingDetails(false)
      setForm(EMPTY_FORM)
      setPage('Discover')
      await loadStories()
    } catch (error) {
      setNotice(error.message || 'Could not update the story.')
    } finally {
      setBusy(false)
    }
  }

  async function createStory(event) {
    event.preventDefault()

    if (!isAdmin || !session?.user) {
      setNotice('Only an administrator can publish stories and polls.')
      return
    }

    if (!supabaseConfigured) {
      setNotice('Connect Supabase before publishing.')
      return
    }

    if (!form.prompt.trim()) {
      setNotice('Enter a poll question.')
      return
    }

    if (![form.a, form.b, form.c].every((value) => value.trim())) {
      setNotice('Complete all three poll options.')
      return
    }

    if (!editingStoryId && (!form.title.trim() || !form.intro.trim())) {
      setNotice('Enter a story title and opening story.')
      return
    }

    if (
      form.closesAt &&
      new Date(form.closesAt).getTime() <= Date.now()
    ) {
      setNotice('Choose a closing time in the future.')
      return
    }

    setBusy(true)
    setNotice('')

    try {
      let storyId = editingStoryId

      if (!storyId) {
        const { data: newStory, error: storyError } = await supabase
          .from('stories')
          .insert({
            title: form.title.trim(),
            genre: form.genre,
            opening_text: form.intro.trim(),
            story_text: form.intro.trim(),
            reference_header: form.reference.trim(),
            cover_image_url: form.image.trim() || null,
            status: 'published',
            created_by: session.user.id,
          })
          .select()
          .single()

        if (storyError) throw storyError
        storyId = newStory.id
      }

      const { data: existingPolls, error: existingError } = await supabase
        .from('polls')
        .select('id,status,closes_at')
        .eq('story_id', storyId)

      if (existingError) throw existingError

      const existingOpenPoll = (existingPolls || []).find(isPollOpen)

      if (existingOpenPoll) {
        throw new Error(
          'This story already has an open poll. Close it before publishing another.',
        )
      }

      const { data: poll, error: pollError } = await supabase
        .from('polls')
        .insert({
          story_id: storyId,
          prompt: form.prompt.trim(),
          status: 'open',
          closes_at: form.closesAt
            ? new Date(form.closesAt).toISOString()
            : null,
        })
        .select()
        .single()

      if (pollError) throw pollError

      const options = [
        {
          poll_id: poll.id,
          label: 'A',
          continuation_text: form.a.trim(),
          position: 1,
        },
        {
          poll_id: poll.id,
          label: 'B',
          continuation_text: form.b.trim(),
          position: 2,
        },
        {
          poll_id: poll.id,
          label: 'C',
          continuation_text: form.c.trim(),
          position: 3,
        },
      ]

      const { error: optionsError } = await supabase
        .from('story_options')
        .insert(options)

      if (optionsError) throw optionsError

      setForm(EMPTY_FORM)
      setEditingStoryId(null)
      setEditingDetails(false)
      setPage('Discover')
      setNotice(
        storyId && editingStoryId
          ? 'The next poll has been published.'
          : 'Story and poll published successfully.',
      )

      await loadStories()
    } catch (error) {
      console.error('Publishing failed:', error)
      setNotice(error.message || 'Could not publish the story.')
    } finally {
      setBusy(false)
    }
  }

  async function uploadCover(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]

    if (!allowedTypes.includes(file.type)) {
      setNotice('Choose a JPG, PNG, WebP, or GIF image.')
      event.target.value = ''
      return
    }

    if (file.size > 8 * 1024 * 1024) {
      setNotice('The cover image must be 8 MB or smaller.')
      event.target.value = ''
      return
    }

    if (!supabaseConfigured || !session?.user) {
      setNotice('Sign in and connect Supabase before uploading an image.')
      event.target.value = ''
      return
    }

    setUploading(true)

    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${session.user.id}/${Date.now()}.${extension}`

      const { error } = await supabase.storage
        .from('story-images')
        .upload(path, file)

      if (error) throw error

      const { data } = supabase.storage
        .from('story-images')
        .getPublicUrl(path)

      updateForm('image', data.publicUrl)
      setNotice('Cover image uploaded.')
    } catch (error) {
      setNotice(error.message || 'Image upload failed.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function finalizePoll(poll) {
    if (!isAdmin || !poll || !supabaseConfigured) return

    if (!isPollOpen(poll)) {
      setNotice('This poll is already closed or its deadline has passed.')
      return
    }

    if (
      !window.confirm(
        'Close this poll and append the winning continuation to the story?',
      )
    ) {
      return
    }

    setBusy(true)

    try {
      const { error } = await supabase.rpc('finalize_story_poll', {
        p_poll_id: poll.id,
      })

      if (error) throw error

      setNotice('Poll finalized.')
      await loadStories()
    } catch (error) {
      setNotice(error.message || 'Could not finalize the poll.')
    } finally {
      setBusy(false)
    }
  }

  async function setStoryStatus(story, status) {
    if (!isAdmin || !supabaseConfigured) return

    const action = status === 'archived' ? 'archive' : 'reopen'

    if (!window.confirm(`Are you sure you want to ${action} "${story.title}"?`)) {
      return
    }

    setBusy(true)

    try {
      const { error } = await supabase
        .from('stories')
        .update({ status })
        .eq('id', story.id)

      if (error) throw error

      setNotice(
        status === 'archived'
          ? 'Story archived.'
          : 'Story returned to Discover.',
      )

      await loadStories()
    } catch (error) {
      setNotice(error.message || 'Could not update story status.')
    } finally {
      setBusy(false)
    }
  }

  function exportStoryText(story) {
    if (!story) return

    const content = [
      story.title,
      story.genre,
      '',
      story.reference_header || '',
      '',
      story.story_text || story.opening_text || '',
      '',
      'POLL HISTORY',
      ...(story.poll_history || []).flatMap((poll) => [
        '',
        poll.prompt,
        ...poll.options.map(
          (option) =>
            `${option.label}. ${option.continuation_text} — ${option.votes || 0} votes`,
        ),
        `Status: ${poll.status}`,
      ]),
    ].join('\n')

    const blob = new Blob([content], {
      type: 'text/plain;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${story.title
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()}.txt`

    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function renderStoryCards() {
    if (!filtered.length) {
      return (
        <div className="empty-state">
          <h3>No stories found</h3>
          <p>Try another search or choose a different genre.</p>
        </div>
      )
    }

    return (
      <div className="story-grid">
        {filtered.map((story) => (
          <article className="story-card" key={story.id}>
            {story.cover_image_url && (
              <img
                className="story-card-image"
                src={story.cover_image_url}
                alt={story.title}
              />
            )}

            <div className="story-card-content">
              <span className="story-genre">{story.genre}</span>
              <h3>{story.title}</h3>
              <p>
                {story.opening_text ||
                  story.story_text ||
                  'Open this story to discover what happens next.'}
              </p>

              <div className="story-card-actions">
                <button
                  className="primary-button"
                  onClick={() => openStory(story)}
                >
                  Read story
                </button>

                <button
                  className="secondary-button"
                  onClick={() => shareStory(story)}
                >
                  Share
                </button>

                {isAdmin && (
                  <button
                    className="secondary-button"
                    onClick={() => prepareEditStory(story)}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">✦</div>
          <div>
            <strong>INCOG</strong>
            <span>PLOTLINE</span>
          </div>
        </div>

        <div className="sidebar-label">MENU</div>

        <nav className="side-nav">
          {['Discover', 'Read & vote', 'Archive'].map((item) => (
            <button
              key={item}
              className={page === item ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setPage(item)

                if (item === 'Read & vote' && !selected && stories[0]) {
                  setSelected(stories[0])
                }
              }}
            >
              <span>
                {item === 'Discover'
                  ? '⌕'
                  : item === 'Archive'
                    ? '▤'
                    : '◉'}
              </span>
              {item}
            </button>
          ))}

          {isAdmin && (
            <button
              className={
                page === 'Creator Studio'
                  ? 'nav-item active'
                  : 'nav-item'
              }
              onClick={() => setPage('Creator Studio')}
            >
              <span>✎</span>
              Creator Studio
            </button>
          )}
        </nav>

        <div className="sidebar-label">GENRES</div>

        <nav className="genre-nav">
          {['All stories', ...GENRES].map((item) => (
            <button
              key={item}
              className={
                genre === item ? 'genre-item active' : 'genre-item'
              }
              onClick={() => {
                setGenre(item)

                if (page !== 'Discover' && page !== 'Archive') {
                  setPage('Discover')
                }
              }}
            >
              <span className="genre-dot" />
              {item}
            </button>
          ))}
        </nav>

        <div className="community-card">
          <span className="community-icon">✦</span>
          <h3>Stories made together.</h3>
          <p>Read, vote, and shape what happens next.</p>
          <button
            className="secondary-button"
            onClick={() => {
              setAuthMode('signup')
              setAuthNotice('')
              setAuthOpen(true)
            }}
          >
            Join the community
          </button>
        </div>

        <div className="sidebar-profile">
          <div className="profile-avatar">
            {displayName(session?.user).charAt(0).toUpperCase()}
          </div>

          <div className="profile-details">
            <strong>{displayName(session?.user)}</strong>
            <span>
              {isAdmin
                ? 'Administrator'
                : session?.user?.email || 'Guest reader'}
            </span>
          </div>

          {session?.user && (
            <button
              className="icon-button"
              title="Sign out"
              onClick={signOut}
            >
              ↗
            </button>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>INCOG PLOTLINE</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{page}</strong>
          </div>

          <div className="topbar-actions">
            <div className="search-box">
              <span>⌕</span>
              <input
                type="search"
                placeholder="Search stories..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {session?.user ? (
              <button className="secondary-button" onClick={signOut}>
                Sign out
              </button>
            ) : (
              <button
                className="secondary-button"
                onClick={() => {
                  setAuthMode('signin')
                  setAuthNotice('')
                  setAuthOpen(true)
                }}
              >
                Sign in
              </button>
            )}

            {isAdmin && (
              <button
                className="primary-button"
                onClick={prepareNewStory}
              >
                + Create story
              </button>
            )}
          </div>
        </header>

        {notice && (
          <div className="notice-banner" role="status">
            <span>{notice}</span>
            <button
              onClick={() => setNotice('')}
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        )}

        {(page === 'Discover' || page === 'Archive') && (
          <>
            <section className="hero-section">
              <div className="hero-copy">
                <span className="eyebrow">
                  {page === 'Archive'
                    ? 'THE STORY COLLECTION'
                    : 'INTERACTIVE FICTION'}
                </span>

                <h1>
                  Every story has
                  <br />
                  <em>another side.</em>
                </h1>

                <p>
                  Read the story. Cast your vote. Decide what happens next.
                  Every choice becomes part of the story.
                </p>

                <div className="hero-actions">
                  <button
                    className="primary-button"
                    disabled={!filtered.length}
                    onClick={() => {
                      if (filtered[0]) openStory(filtered[0])
                    }}
                  >
                    Explore stories <span>↗</span>
                  </button>

                  <span className="hero-caption">
                    {filtered.length}{' '}
                    {filtered.length === 1 ? 'story' : 'stories'}
                  </span>
                </div>
              </div>

              <div className="hero-art">
                <img
                  src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1000&q=85"
                  alt="Misty cinematic forest"
                />
                <div className="art-overlay" />
                <div className="floating-note">
                  <span>✦ FEATURED STORY</span>
                  <b>The Strange Noise</b>
                  <small>One choice changes everything.</small>
                </div>
                <div className="art-index">
                  01 <span>/ 03</span>
                </div>
              </div>
            </section>

            <section className="section-heading">
              <div>
                <span className="eyebrow">
                  {page === 'Archive' ? 'PAST STORIES' : 'THE LIBRARY'}
                </span>
                <h2>
                  {page === 'Archive'
                    ? 'The Archive'
                    : 'Discover stories'}
                </h2>
              </div>

              <span className="section-count">
                {filtered.length.toString().padStart(2, '0')} STORIES
              </span>
            </section>

            {renderStoryCards()}
          </>
        )}

        {page === 'Read & vote' && (
          <section className="reader-view">
            {!active ? (
              <div className="empty-state">
                <h2>No story selected</h2>
                <p>Choose a story from Discover to start reading.</p>
                <button
                  className="primary-button"
                  onClick={() => setPage('Discover')}
                >
                  Discover stories
                </button>
              </div>
            ) : (
              <>
                {active.cover_image_url && (
                  <div className="reader-cover">
                    <img
                      src={active.cover_image_url}
                      alt={active.title}
                    />
                  </div>
                )}

                <div className="reader-heading">
                  <span className="story-genre">{active.genre}</span>
                  <h1>{active.title}</h1>

                  {active.reference_header && (
                    <p className="reader-reference">
                      {active.reference_header}
                    </p>
                  )}

                  <div className="reader-actions">
                    <button
                      className="secondary-button"
                      onClick={() => shareStory(active)}
                    >
                      Share story
                    </button>

                    <button
                      className="secondary-button"
                      onClick={() => exportStoryText(active)}
                    >
                      Export story
                    </button>
                  </div>
                </div>

                <article className="story-text">
                  {(active.story_text || active.opening_text || '')
                    .split(/\n+/)
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={`${active.id}-${index}`}>{paragraph}</p>
                    ))}
                </article>

                <div className="poll-history-controls">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setSelectedPollId(null)
                      setShowPollHistory(false)

                      const url = new URL(window.location.href)
                      url.searchParams.set('story', active.id)
                      url.searchParams.delete('poll')
                      window.history.replaceState({}, '', url)
                    }}
                  >
                    View current poll
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() =>
                      setShowPollHistory((current) => !current)
                    }
                  >
                    {showPollHistory
                      ? 'Hide previous polls'
                      : 'View previous polls'}
                  </button>
                </div>

                {showPollHistory && (
                  <section className="poll-history">
                    <h2>Poll history</h2>

                    {!active.poll_history?.length ? (
                      <p>No polls have been created for this story yet.</p>
                    ) : (
                      active.poll_history.map((poll) => (
                        <button
                          key={poll.id}
                          className={
                            selectedPollId === poll.id
                              ? 'poll-history-item active'
                              : 'poll-history-item'
                          }
                          onClick={() => {
                            setSelectedPollId(poll.id)
                            setShowPollHistory(false)

                            const url = new URL(window.location.href)
                            url.searchParams.set('story', active.id)
                            url.searchParams.set('poll', poll.id)
                            window.history.replaceState({}, '', url)
                          }}
                        >
                          <span>{poll.prompt}</span>
                          <small>
                            {isPollOpen(poll) ? 'OPEN' : 'CLOSED'} ·{' '}
                            {poll.options?.length || 0} options
                          </small>
                        </button>
                      ))
                    )}
                  </section>
                )}

                {activePoll ? (
                  <section className="poll-panel">
                    <div className="poll-heading">
                      <span className="eyebrow">
                        {isPollOpen(activePoll)
                          ? 'YOUR CHOICE MATTERS'
                          : 'POLL RESULTS'}
                      </span>

                      <h2>{activePoll.prompt}</h2>

                      <p>
                        {isPollOpen(activePoll)
                          ? 'Choose the continuation you want to see.'
                          : 'This poll is closed. Its results remain available.'}
                      </p>
                    </div>

                    {activePoll.closes_at && isPollOpen(activePoll) && (
                      <p className="poll-deadline">
                        Closes{' '}
                        {new Date(activePoll.closes_at).toLocaleString()}
                      </p>
                    )}

                    <div className="poll-options">
                      {(activePoll.options || []).map((option) => {
                        const total = activePoll.options.reduce(
                          (sum, item) =>
                            sum + Number(item.votes || 0),
                          0,
                        )

                        const percentage = total
                          ? Math.round(
                              (Number(option.votes || 0) / total) * 100,
                            )
                          : 0

                        const hasVoted = Boolean(voted[activePoll.id])
                        const showResults =
                          !isPollOpen(activePoll) || hasVoted

                        return (
                          <div className="poll-option" key={option.id}>
                            <button
                              className={
                                voted[activePoll.id] === option.id
                                  ? 'poll-option-button selected'
                                  : 'poll-option-button'
                              }
                              onClick={() => castVote(option.id)}
                              disabled={
                                busy ||
                                !isPollOpen(activePoll) ||
                                hasVoted ||
                                !supabaseConfigured
                              }
                            >
                              <span className="option-letter">
                                {option.label}
                              </span>

                              <span className="option-content">
                                <strong>{option.label}</strong>
                                <small>{option.continuation_text}</small>
                              </span>

                              {showResults && (
                                <span className="option-result">
                                  {percentage}%
                                  <small>
                                    {option.votes || 0} votes
                                  </small>
                                </span>
                              )}
                            </button>

                            {showResults && (
                              <div className="poll-result-track">
                                <div
                                  className="poll-result-fill"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {!session?.user && isPollOpen(activePoll) && (
                      <p className="poll-signin-note">
                        Sign in to vote. Your choice helps shape the story.
                      </p>
                    )}

                    {session?.user && !supabaseConfigured && (
                      <p className="poll-signin-note">
                        Demo polls are read-only until Supabase is connected.
                      </p>
                    )}

                    <button
                      className="secondary-button"
                      onClick={() => shareStory(active, activePoll)}
                    >
                      Share this poll
                    </button>
                  </section>
                ) : (
                  <section className="poll-panel">
                    <h2>No poll yet</h2>
                    <p>The next choice has not been published.</p>
                  </section>
                )}

                {isAdmin && (
                  <div className="admin-story-actions">
                    <button
                      className="secondary-button"
                      onClick={() => prepareEditStory(active)}
                    >
                      Edit story details
                    </button>

                    <button
                      className="secondary-button"
                      onClick={() => prepareNextPoll(active)}
                    >
                      Add next poll
                    </button>

                    {active.status === 'published' ? (
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setStoryStatus(active, 'archived')
                        }
                      >
                        Archive story
                      </button>
                    ) : (
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setStoryStatus(active, 'published')
                        }
                      >
                        Reopen story
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {page === 'Creator Studio' && isAdmin && (
          <section className="creator-page">
            <div className="section-heading">
              <div>
                <span className="eyebrow">ADMINISTRATION</span>
                <h2>Creator Studio</h2>
                <p>Publish stories and manage their polls.</p>
              </div>
            </div>

            <div className="creator-tabs">
              <button
                className={
                  adminTab === 'Create story'
                    ? 'creator-tab active'
                    : 'creator-tab'
                }
                onClick={() => setAdminTab('Create story')}
              >
                {editingDetails
                  ? 'Edit story'
                  : editingStoryId
                    ? 'Add poll'
                    : 'Create story'}
              </button>

              <button
                className={
                  adminTab === 'Manage polls'
                    ? 'creator-tab active'
                    : 'creator-tab'
                }
                onClick={() => setAdminTab('Manage polls')}
              >
                Manage polls
              </button>
            </div>

            {adminTab === 'Create story' && (
              <form
                className="story-form"
                onSubmit={
                  editingDetails ? saveStoryDetails : createStory
                }
              >
                <div className="form-section-heading">
                  <h3>
                    {editingDetails
                      ? 'Edit story details'
                      : editingStoryId
                        ? 'Add a poll to an existing story'
                        : 'Create a new story'}
                  </h3>

                  <p>
                    {editingDetails
                      ? 'Update the title, genre, opening, reference, and cover without deleting poll history.'
                      : editingStoryId
                        ? 'Create the next choice for this existing story.'
                        : 'Write the opening and give readers three possible continuations.'}
                  </p>
                </div>

                {(!editingStoryId || editingDetails) && (
                  <>
                    <label>
                      Story title
                      <input
                        value={form.title}
                        onChange={(event) =>
                          updateForm('title', event.target.value)
                        }
                        placeholder="Enter a memorable title"
                        maxLength={150}
                        required
                      />
                    </label>

                    <label>
                      Genre
                      <select
                        value={form.genre}
                        onChange={(event) =>
                          updateForm('genre', event.target.value)
                        }
                      >
                        {GENRES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Opening story
                      <textarea
                        value={form.intro}
                        onChange={(event) =>
                          updateForm('intro', event.target.value)
                        }
                        placeholder="Write the beginning of the story..."
                        rows={6}
                        required
                      />
                    </label>

                    <label>
                      Reference header
                      <input
                        value={form.reference}
                        onChange={(event) =>
                          updateForm('reference', event.target.value)
                        }
                        placeholder="A short line beneath the title"
                      />
                    </label>

                    <label>
                      Cover image URL
                      <input
                        type="url"
                        value={form.image}
                        onChange={(event) =>
                          updateForm('image', event.target.value)
                        }
                        placeholder="https://..."
                      />
                    </label>

                    <label>
                      Upload cover image
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={uploadCover}
                        disabled={uploading}
                      />
                    </label>

                    {uploading && <p>Uploading image…</p>}

                    {form.image && (
                      <div className="cover-preview">
                        <img
                          src={form.image}
                          alt="Story cover preview"
                        />
                      </div>
                    )}
                  </>
                )}

                {editingStoryId && !editingDetails && (
                  <div className="admin-note">
                    Adding a poll to an existing story preserves its title,
                    opening text, cover image, and previous polls.
                  </div>
                )}

                {!editingDetails && (
                  <>
                    <label>
                      Poll question
                      <input
                        value={form.prompt}
                        onChange={(event) =>
                          updateForm('prompt', event.target.value)
                        }
                        placeholder="What should happen next?"
                        maxLength={300}
                        required
                      />
                    </label>

                    <label>
                      Option A — continuation
                      <textarea
                        value={form.a}
                        onChange={(event) =>
                          updateForm('a', event.target.value)
                        }
                        rows={3}
                        required
                      />
                    </label>

                    <label>
                      Option B — continuation
                      <textarea
                        value={form.b}
                        onChange={(event) =>
                          updateForm('b', event.target.value)
                        }
                        rows={3}
                        required
                      />
                    </label>

                    <label>
                      Option C — continuation
                      <textarea
                        value={form.c}
                        onChange={(event) =>
                          updateForm('c', event.target.value)
                        }
                        rows={3}
                        required
                      />
                    </label>

                    <label>
                      Poll closing time (optional)
                      <input
                        type="datetime-local"
                        value={form.closesAt}
                        onChange={(event) =>
                          updateForm('closesAt', event.target.value)
                        }
                      />
                    </label>
                  </>
                )}

                <div className="admin-note">
                  Closing a poll with the administrator control finalizes its
                  result through your existing Supabase function.
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingStoryId(null)
                      setEditingDetails(false)
                      setForm(EMPTY_FORM)
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={busy || uploading}
                  >
                    {busy
                      ? 'Please wait…'
                      : editingDetails
                        ? 'Save story changes'
                        : editingStoryId
                          ? 'Publish next poll'
                          : 'Publish story'}
                  </button>
                </div>
              </form>
            )}

            {adminTab === 'Manage polls' && (
              <div className="manage-polls">
                {!stories.length && <p>No stories are available yet.</p>}

                {stories.map((story) => (
                  <article className="manage-story" key={story.id}>
                    <div className="manage-story-heading">
                      <div>
                        <span className="story-genre">
                          {story.genre}
                        </span>
                        <h3>{story.title}</h3>
                        <small>
                          {story.status === 'archived'
                            ? 'Archived'
                            : 'Published'}{' '}
                          · {story.poll_history?.length || 0} polls
                        </small>
                      </div>

                      <div className="manage-story-actions">
                        <button
                          className="secondary-button"
                          onClick={() => openStory(story)}
                        >
                          Read
                        </button>

                        <button
                          className="secondary-button"
                          onClick={() => prepareEditStory(story)}
                        >
                          Edit details
                        </button>

                        <button
                          className="secondary-button"
                          onClick={() => prepareNextPoll(story)}
                        >
                          Add poll
                        </button>

                        {story.status === 'published' ? (
                          <button
                            className="secondary-button"
                            onClick={() =>
                              setStoryStatus(story, 'archived')
                            }
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            className="secondary-button"
                            onClick={() =>
                              setStoryStatus(story, 'published')
                            }
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>

                    {(story.poll_history || []).map((poll) => (
                      <div className="manage-poll-row" key={poll.id}>
                        <div>
                          <strong>{poll.prompt}</strong>
                          <small>
                            {isPollOpen(poll) ? 'Open' : 'Closed'} ·{' '}
                            {poll.options.reduce(
                              (sum, option) =>
                                sum + Number(option.votes || 0),
                              0,
                            )}{' '}
                            votes
                          </small>
                        </div>

                        <div className="manage-poll-actions">
                          <button
                            className="secondary-button"
                            onClick={() => openStory(story, poll.id)}
                          >
                            View results
                          </button>

                          <button
                            className="secondary-button"
                            onClick={() => shareStory(story, poll)}
                          >
                            Share poll
                          </button>

                          {isPollOpen(poll) && (
                            <button
                              className="primary-button"
                              onClick={() => finalizePoll(poll)}
                              disabled={busy}
                            >
                              Close poll
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {page === 'Creator Studio' && !isAdmin && (
          <section className="empty-state">
            <h2>Creator Studio is private</h2>
            <p>
              Sign in with an account that has administrator access to manage
              stories and polls.
            </p>
            <button
              className="primary-button"
              onClick={() => {
                setAuthMode('signin')
                setAuthNotice('')
                setAuthOpen(true)
              }}
            >
              Sign in
            </button>
          </section>
        )}

        <footer className="app-footer">
          <span>INCOG PLOTLINE</span>
          <span>Stories shaped by readers.</span>
        </footer>
      </main>

      {authOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setAuthOpen(false)
            }
          }}
        >
          <section
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
          >
            <button
              className="modal-close"
              onClick={() => setAuthOpen(false)}
              aria-label="Close"
            >
              ×
            </button>

            <span className="eyebrow">INCOG PLOTLINE</span>

            <h2 id="auth-title">
              {authMode === 'signup'
                ? 'Create your account'
                : 'Welcome back'}
            </h2>

            <p>
              {authMode === 'signup'
                ? 'Join the readers who shape every story.'
                : 'Sign in to vote and follow the stories.'}
            </p>

            {authNotice && (
              <div
                className="auth-notice"
                role="status"
                aria-live="polite"
              >
                <p>{authNotice}</p>
              </div>
            )}

            <form onSubmit={authenticate}>
              {authMode === 'signup' && (
                <label>
                  Full name
                  <input
                    type="text"
                    value={fullName}
                    onChange={(event) =>
                      setFullName(event.target.value)
                    }
                    autoComplete="name"
                    maxLength={100}
                    required
                  />
                </label>
              )}

              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                Password
                <div className="password-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    autoComplete={
                      authMode === 'signup'
                        ? 'new-password'
                        : 'current-password'
                    }
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                className="primary-button"
                disabled={busy}
              >
                {busy
                  ? 'Please wait…'
                  : authMode === 'signup'
                    ? 'Create account'
                    : 'Sign in'}
              </button>

              <div className="auth-divider"><span>OR</span></div>

              <button
                type="button"
                className="secondary-button google-signin-button"
                onClick={signInWithGoogle}
                disabled={busy}
              >
                Continue with Google
              </button>
            </form>

            <p className="auth-switch">
              {authMode === 'signup'
                ? 'Already have an account?'
                : 'New to Incog Plotline?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode((current) =>
                    current === 'signup' ? 'signin' : 'signup',
                  )
                  setAuthNotice('')
                  setPassword('')
                  setShowPassword(false)
                }}
              >
                {authMode === 'signup'
                  ? 'Sign in'
                  : 'Create account'}
              </button>
            </p>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
