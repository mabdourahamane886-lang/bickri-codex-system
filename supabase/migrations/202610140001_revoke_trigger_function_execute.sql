-- BCX migration 003 : la fonction de trigger ne doit pas être appelable via l'API (/rest/v1/rpc).
-- Le trigger sur auth.users continue de fonctionner : aucun droit EXECUTE n'est vérifié au déclenchement.
revoke execute on function public.bcx_handle_new_user() from public, anon, authenticated;
