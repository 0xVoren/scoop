'use client'

import { CreateForm } from '@/components/create-form'
import { useT } from '@/lib/i18n'

export default function CreatePage() {
  const t = useT()
  return (
    <>
      <div className="page-h">
        <div>
          <h1>{t('createTitle')}</h1>
          <p>{t('createLead')}</p>
        </div>
      </div>
      <div className="box" style={{ maxWidth: 560 }}>
        <div className="box-h">
          <h2>{t('createParams')}</h2>
        </div>
        <div className="box-b">
          <CreateForm />
        </div>
      </div>
    </>
  )
}
