import { Spinner } from '@/components/ui/spinner.tsx'

const Loader = () => <div className='flex items-center justify-center h-full w-full'>
    <Spinner className="text-primary" size={32} variant='circle' />
</div>

export default Loader;