package store

const systemSchemaName = "_mina_internal"

func systemSchemaQualifiedName() string {
	return QuoteIdentifier("memory") + "." + QuoteIdentifier(systemSchemaName)
}

func systemSchemaObjectName(name string) string {
	return systemSchemaQualifiedName() + "." + QuoteIdentifier(name)
}
